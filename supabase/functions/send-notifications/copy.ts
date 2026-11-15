// ============================================================
// BiteLog notification copy
// ============================================================
// Short, playful, specific. Every message names a person, a number
// or a concrete next step so it feels like a nudge from a friend,
// not a system alert. Copy never mentions specific foods or body
// weight, and never guilt-trips.
//
// Variants are picked deterministically from a seed, so the same
// event always produces the same text while different days/users
// get different lines.
// ============================================================

export type Candidate = {
  user_id: string;
  kind: string;
  event_key: string;
  local_date: string;
  local_hour: number;
  data: Record<string, unknown>;
};

export type Message = {
  title: string;
  body: string;
};

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(options: T[], seed: string): T {
  return options[hash(seed) % options.length];
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function name(value: unknown, fallback = 'A friend'): string {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

function days(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/* ------------------------------------------------------------ */
/* Evening "log your food" reminder                              */
/* ------------------------------------------------------------ */

function logReminder(data: Record<string, unknown>, seed: string): Message {
  const streak = num(data.streak);
  const gap = Math.round(num(data.gap));
  const rival = data.rival_name ? name(data.rival_name) : null;

  const pool: Message[] = [];

  // A day is worth at most 15 points, so only claim "you can pass
  // them tonight" when the gap is within reach.
  if (rival && gap > 0 && gap <= 14) {
    pool.push(
      {
        title: `🏆 ${rival} is ${gap} pts ahead of you`,
        body: 'Tonight’s logs are worth up to 15 pts. Time to make a move.',
      },
      {
        title: `👀 Just ${gap} pts between you and ${rival}`,
        body: 'Log your meals and chase them down before the day ends.',
      },
      {
        title: `⚡ Overtake ${rival} tonight`,
        body: `You’re ${gap} pts back. Log your meals and hit your goal to jump ahead.`,
      },
    );
  }

  if (streak >= 1) {
    pool.push(
      {
        title: `🔥 Day ${streak + 1} is calling`,
        body: `${days(streak)} strong. Log today’s meals to keep the fire going.`,
      },
      {
        title: `🔥 Your ${streak}-day streak is hungry`,
        body: 'Feed it! Log your meals before the day runs out.',
      },
    );
  }

  pool.push(
    {
      title: '🍽️ Plate check!',
      body: 'Log a meal now and bank 2 easy points.',
    },
    {
      title: '🎯 Easy points alert',
      body: 'Log 3 meals today for +5, then hit your goal for +10. Let’s go!',
    },
    {
      title: '📸 Snap it, log it',
      body: 'Scan your meal with AI. It takes about 10 seconds.',
    },
    {
      title: '🏁 The day isn’t over yet',
      body: 'Log today before bed and keep your week on track.',
    },
  );

  return pick(pool, seed);
}

/* ------------------------------------------------------------ */
/* Streak at risk                                                */
/* ------------------------------------------------------------ */

function streakRisk(data: Record<string, unknown>, seed: string): Message {
  const streak = Math.round(num(data.streak));
  const entries = num(data.entries);
  const consumed = num(data.consumed);
  const goal = num(data.goal);

  // A day qualifies with at least 2 entries AND 85-105% of the goal.
  const needEntries = Math.max(0, 2 - entries);
  const needKcal = Math.max(0, Math.ceil(goal * 0.85 - consumed));

  let todo: string;

  if (needEntries > 0 && needKcal > 0) {
    todo = `Log ${
      needEntries === 1 ? 'one more meal' : 'two meals'
    } and add roughly ${needKcal} kcal to land in your goal zone.`;
  } else if (needKcal > 0) {
    todo = `You’re about ${needKcal} kcal short of your goal zone. One more meal could save it.`;
  } else if (needEntries > 0) {
    todo = 'Log one more entry to lock in today.';
  } else {
    todo = 'Log your last meal to lock in today.';
  }

  const title = pick(
    [
      `🔥 ${streak}-day streak on the line`,
      `🚨 ${days(streak)} of progress at risk`,
      `⏳ Save your ${streak}-day streak`,
    ],
    seed,
  );

  return { title, body: todo };
}

/* ------------------------------------------------------------ */
/* Friend hit their goal (single or batched)                     */
/* ------------------------------------------------------------ */

function friendGoal(items: Candidate[], seed: string): Message {
  const names = [
    ...new Set(items.map((item) => name(item.data.actor_name))),
  ];

  if (names.length === 1) {
    const who = names[0];

    return pick(
      [
        {
          title: `🎯 ${who} just hit their goal`,
          body: `${who} crushed today’s calorie target. Your turn?`,
        },
        {
          title: `👏 ${who} is on target`,
          body: 'Nice one from them. Log your meals and keep up!',
        },
        {
          title: `🔥 ${who} is on fire today`,
          body: 'Daily goal: done. How’s yours looking?',
        },
      ],
      seed,
    );
  }

  const others = names.length - 2;

  return {
    title: `🎯 ${names.length} friends hit their goal`,
    body: `${names[0]}, ${names[1]}${
      others > 0 ? ` and ${others} more` : ''
    } are done for today. Don’t get left behind!`,
  };
}

/* ------------------------------------------------------------ */
/* Overtaken on the weekly leaderboard                           */
/* ------------------------------------------------------------ */

function overtaken(data: Record<string, unknown>, seed: string): Message {
  const who = name(data.actor_name);
  const gap = Math.max(1, Math.round(num(data.gap)));
  const group = name(data.group_name, 'your group');

  return pick(
    [
      {
        title: `👀 ${who} just passed you`,
        body: `You’re ${gap} pts back in ${group}. Log a meal to take it back.`,
      },
      {
        title: `😏 ${who} just edged past you`,
        body: `${gap} pts to win it back in ${group}. Game on.`,
      },
      {
        title: `⚔️ ${who} is ahead of you now`,
        body: `You’re ${gap} pts behind in ${group}. One good day flips it.`,
      },
    ],
    seed,
  );
}

/* ------------------------------------------------------------ */
/* Group invitation                                              */
/* ------------------------------------------------------------ */

function invite(data: Record<string, unknown>, seed: string): Message {
  const who = name(data.inviter_name);
  const group = name(data.group_name, 'a group');

  return pick(
    [
      {
        title: `💌 ${who} wants you in ${group}`,
        body: 'Join the squad and start climbing the weekly leaderboard.',
      },
      {
        title: '🤝 You’ve been invited!',
        body: `${who} invited you to ${group}. Tap to join the competition.`,
      },
    ],
    seed,
  );
}

/* ------------------------------------------------------------ */
/* Public API                                                    */
/* ------------------------------------------------------------ */

export function buildMessage(kind: string, items: Candidate[]): Message {
  const first = items[0];
  const seed = `${first.user_id}:${first.event_key}`;

  switch (kind) {
    case 'log_reminder':
      return logReminder(first.data, seed);
    case 'streak_risk':
      return streakRisk(first.data, seed);
    case 'friend_goal':
      return friendGoal(items, seed);
    case 'overtaken':
      return overtaken(first.data, seed);
    case 'invite':
      return invite(first.data, seed);
    default:
      return {
        title: 'BiteLog',
        body: 'Your friends are logging. Come see how you’re doing!',
      };
  }
}