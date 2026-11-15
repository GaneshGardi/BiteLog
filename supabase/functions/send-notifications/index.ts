import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMessage, type Candidate, type Message } from './copy.ts';

// ============================================================
// BiteLog: send-notifications
// ============================================================
// Called every 5 minutes by pg_cron (see notifications_cron.sql).
// Protected by a shared secret header, not by a user JWT:
//   x-cron-secret: <CRON_SECRET>
//
// Flow:
//   1. get_notification_candidates()  -> what could be sent now
//   2. drop already-sent events, quiet hours, over-cap users
//   3. batch friend-goal events, keep one message per kind
//   4. claim each event in notification_log (dedupe + cap)
//   5. send through the Expo Push API, prune dead tokens
// ============================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// At most this many notifications per user per local day.
const DAILY_CAP = 2;

// Nothing is sent from 22:00 until 08:00 local time.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;

// Lower number wins when the daily cap is reached.
const PRIORITY: Record<string, number> = {
  invite: 1,
  overtaken: 2,
  streak_risk: 3,
  friend_goal: 4,
  log_reminder: 5,
};

type Plan = {
  userId: string;
  kind: string;
  primary: Candidate;
  extraKeys: string[];
  message: Message;
};

type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: 'default';
  priority: 'high';
  ttl: number;
  data: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function isQuietHour(hour: number) {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

function byEventKey(a: Candidate, b: Candidate) {
  return a.event_key.localeCompare(b.event_key);
}

function routeFor(kind: string): 'home' | 'friends' | 'group' {
  if (kind === 'overtaken') return 'group';
  if (kind === 'friend_goal' || kind === 'invite') return 'friends';
  return 'home';
}

function makePlan(userId: string, kind: string, items: Candidate[]): Plan {
  return {
    userId,
    kind,
    primary: items[0],
    extraKeys: items.slice(1).map((item) => item.event_key),
    message: buildMessage(kind, items),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const cronSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase environment variables are missing.');
    return json({ error: 'Server configuration is missing' }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const now = new Date();

    // --------------------------------------------------------
    // 1. Candidates
    // --------------------------------------------------------
    const { data: rawCandidates, error: candidateError } = await supabase.rpc(
      'get_notification_candidates',
      { p_now: now.toISOString() },
    );

    if (candidateError) {
      console.error('Candidate lookup failed:', candidateError.message);
      return json({ error: 'Candidate lookup failed' }, 500);
    }

    const candidates = (rawCandidates ?? []) as Candidate[];

    if (candidates.length === 0) {
      return json({ candidates: 0, planned: 0, sent: 0, failed: 0 });
    }

    const byUser = new Map<string, Candidate[]>();

    for (const candidate of candidates) {
      const list = byUser.get(candidate.user_id) ?? [];
      list.push(candidate);
      byUser.set(candidate.user_id, list);
    }

    // --------------------------------------------------------
    // 2. What was already sent (dedupe + daily cap)
    // --------------------------------------------------------
    const since = new Date(
      now.getTime() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const seen = new Set<string>();
    const countedToday = new Map<string, number>();

    for (const ids of chunk([...byUser.keys()], 100)) {
      const { data: history, error: historyError } = await supabase
        .from('notification_log')
        .select('user_id, event_key, local_date, counted')
        .in('user_id', ids)
        .gte('sent_at', since);

      if (historyError) {
        console.error('History lookup failed:', historyError.message);
        return json({ error: 'History lookup failed' }, 500);
      }

      for (const row of history ?? []) {
        seen.add(`${row.user_id}|${row.event_key}`);

        if (row.counted) {
          const key = `${row.user_id}|${row.local_date}`;
          countedToday.set(key, (countedToday.get(key) ?? 0) + 1);
        }
      }
    }

    // --------------------------------------------------------
    // 3. Plan: quiet hours, batching, priority, cap
    // --------------------------------------------------------
    const plans: Plan[] = [];

    for (const [userId, list] of byUser) {
      const localDate = list[0].local_date;

      let items = list.filter(
        (item) =>
          !seen.has(`${userId}|${item.event_key}`) &&
          !isQuietHour(item.local_hour),
      );

      if (items.length === 0) continue;

      // The streak alert is more urgent than the generic reminder.
      if (items.some((item) => item.kind === 'streak_risk')) {
        items = items.filter((item) => item.kind !== 'log_reminder');
      }

      const userPlans: Plan[] = [];

      // Several friends hitting their goal become ONE notification.
      const friendGoals = items
        .filter((item) => item.kind === 'friend_goal')
        .sort(byEventKey);

      if (friendGoals.length > 0) {
        userPlans.push(makePlan(userId, 'friend_goal', friendGoals));
      }

      // Every other kind: at most one message per run.
      const usedKinds = new Set<string>();

      for (const item of items
        .filter((entry) => entry.kind !== 'friend_goal')
        .sort(byEventKey)) {
        if (usedKinds.has(item.kind)) continue;
        usedKinds.add(item.kind);
        userPlans.push(makePlan(userId, item.kind, [item]));
      }

      userPlans.sort(
        (a, b) => (PRIORITY[a.kind] ?? 99) - (PRIORITY[b.kind] ?? 99),
      );

      const remaining =
        DAILY_CAP - (countedToday.get(`${userId}|${localDate}`) ?? 0);

      plans.push(...userPlans.slice(0, Math.max(0, remaining)));
    }

    if (plans.length === 0) {
      return json({
        candidates: candidates.length,
        planned: 0,
        sent: 0,
        failed: 0,
      });
    }

    // --------------------------------------------------------
    // 4. Claim events (unique per user + event_key)
    // --------------------------------------------------------
    const logRows = plans.flatMap((plan) => {
      const base = {
        user_id: plan.userId,
        kind: plan.kind,
        title: plan.message.title,
        body: plan.message.body,
        local_date: plan.primary.local_date,
      };

      return [
        { ...base, event_key: plan.primary.event_key, counted: true },
        ...plan.extraKeys.map((key) => ({
          ...base,
          event_key: key,
          counted: false,
        })),
      ];
    });

    // Only rows that were actually inserted come back, so an
    // overlapping run can never send the same event twice.
    const claimed = new Map<string, string>();

    for (const rows of chunk(logRows, 200)) {
      const { data: inserted, error: claimError } = await supabase
        .from('notification_log')
        .upsert(rows, {
          onConflict: 'user_id,event_key',
          ignoreDuplicates: true,
        })
        .select('id, user_id, event_key');

      if (claimError) {
        console.error('Claiming notifications failed:', claimError.message);
        return json({ error: 'Could not record notifications' }, 500);
      }

      for (const row of inserted ?? []) {
        claimed.set(`${row.user_id}|${row.event_key}`, row.id);
      }
    }

    const sendable = plans.filter((plan) =>
      claimed.has(`${plan.userId}|${plan.primary.event_key}`),
    );

    // --------------------------------------------------------
    // 5. Tokens + send
    // --------------------------------------------------------
    const tokensByUser = new Map<string, string[]>();

    for (const ids of chunk([...new Set(sendable.map((p) => p.userId))], 100)) {
      const { data: tokenRows, error: tokenError } = await supabase
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', ids);

      if (tokenError) {
        console.error('Token lookup failed:', tokenError.message);
        return json({ error: 'Token lookup failed' }, 500);
      }

      for (const row of tokenRows ?? []) {
        const list = tokensByUser.get(row.user_id) ?? [];
        list.push(row.token);
        tokensByUser.set(row.user_id, list);
      }
    }

    const messages: PushMessage[] = [];

    for (const plan of sendable) {
      const notificationId = claimed.get(
        `${plan.userId}|${plan.primary.event_key}`,
      );

      for (const token of tokensByUser.get(plan.userId) ?? []) {
        messages.push({
          to: token,
          title: plan.message.title,
          body: plan.message.body,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
          ttl: 2 * 60 * 60,
          data: {
            kind: plan.kind,
            route: routeFor(plan.kind),
            groupId: plan.primary.data.group_id ?? null,
            notificationId,
          },
        });
      }
    }

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const deadTokens = new Set<string>();
    let sent = 0;
    let failed = 0;

    for (const batch of chunk(messages, 100)) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      if (expoAccessToken) {
        headers.Authorization = `Bearer ${expoAccessToken}`;
      }

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error('Expo push request failed:', response.status);
        failed += batch.length;
        continue;
      }

      const result = await response.json();
      const tickets = (result?.data ?? []) as Array<{
        status?: string;
        message?: string;
        details?: { error?: string };
      }>;

      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }

        failed += 1;

        if (ticket?.details?.error === 'DeviceNotRegistered') {
          deadTokens.add(batch[index].to);
        } else {
          console.error('Expo push ticket error:', ticket?.message);
        }
      });
    }

    if (deadTokens.size > 0) {
      const { error: deleteError } = await supabase
        .from('push_tokens')
        .delete()
        .in('token', [...deadTokens]);

      if (deleteError) {
        console.error('Dead token cleanup failed:', deleteError.message);
      }
    }

    return json({
      candidates: candidates.length,
      planned: sendable.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error('send-notifications error:', error);
    return json({ error: 'Unexpected server error' }, 500);
  }
});