-- ============================================================
-- BITELOG: PUSH NOTIFICATIONS FOUNDATION
-- ============================================================
-- Creates:
--   1. push_tokens             (one row per device token)
--   2. notification_preferences (per-user switches + reminder hour)
--   3. notification_log        (dedupe, daily cap, open tracking)
--
-- Client-callable RPCs (authenticated):
--   register_push_token, unregister_push_token,
--   save_notification_preferences, mark_notification_opened
--
-- Server-only functions (service_role):
--   get_notification_candidates, notification_week_points
--
-- Nothing here sends a notification. The send-notifications
-- Edge Function reads get_notification_candidates() and sends.
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

create table public.push_tokens (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    token text not null,
    platform text not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint push_tokens_token_not_empty
        check (length(trim(token)) > 0),

    constraint push_tokens_platform_valid
        check (platform in ('ios', 'android', 'web')),

    -- A device token belongs to exactly one account at a time.
    constraint push_tokens_token_unique
        unique (token)
);

create index push_tokens_user_idx
    on public.push_tokens (user_id);


create table public.notification_preferences (
    user_id uuid primary key
        references public.profiles(id)
        on delete cascade,

    -- Master switch.
    enabled boolean not null default true,

    -- log_reminder + streak_risk
    reminders boolean not null default true,

    -- friend_goal + invite
    friend_activity boolean not null default true,

    -- overtaken
    leaderboard boolean not null default true,

    -- Local hour (0-23) for the daily "log your food" reminder.
    reminder_hour smallint not null default 19,

    -- IANA timezone, e.g. 'Asia/Kolkata'. Set by register_push_token().
    timezone text not null default 'Asia/Kolkata',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- Quiet hours are 22:00-08:00 and the streak alert is at 21:00,
    -- so the daily reminder must fall between 08:00 and 20:00.
    constraint notification_reminder_hour_valid
        check (reminder_hour between 8 and 20)
);


create table public.notification_log (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    -- Stable identifier of the thing we notified about.
    -- Example: 'log_reminder:2026-11-14', 'invite:<uuid>'.
    event_key text not null,

    kind text not null,

    title text,
    body text,

    -- The user's local calendar date when it was sent (for the daily cap).
    local_date date not null,

    -- false for extra events folded into one batched notification.
    counted boolean not null default true,

    sent_at timestamptz not null default now(),
    opened_at timestamptz,

    constraint notification_log_unique_event
        unique (user_id, event_key)
);

create index notification_log_user_date_idx
    on public.notification_log (user_id, local_date);

create index notification_log_user_sent_idx
    on public.notification_log (user_id, sent_at desc);


create trigger push_tokens_updated_at
before update on public.push_tokens
for each row
execute function public.set_updated_at();

create trigger notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();


-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;

-- Users may read their own preferences. Writes go through RPCs.
create policy "Users can view their own notification preferences"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

-- push_tokens and notification_log intentionally have no client policies.


-- ============================================================
-- 3. TABLE PERMISSIONS
-- ============================================================

revoke all on table
    public.push_tokens,
    public.notification_preferences,
    public.notification_log
from public, anon, authenticated;

grant select on table public.notification_preferences to authenticated;

grant all on table public.push_tokens to service_role;
grant all on table public.notification_preferences to service_role;
grant all on table public.notification_log to service_role;


-- ============================================================
-- 4. CLIENT RPCs
-- ============================================================

-- Registers (or moves) a device token to the signed-in user and
-- stores their timezone. Creates default preferences if missing.
create or replace function public.register_push_token(
    p_token text,
    p_platform text,
    p_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_token text;
    v_timezone text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'You must be signed in to register notifications';
    end if;

    v_token := trim(p_token);

    if v_token is null
       or length(v_token) = 0
       or length(v_token) > 300 then
        raise exception 'Invalid push token';
    end if;

    if p_platform is null or p_platform not in ('ios', 'android', 'web') then
        raise exception 'Invalid platform';
    end if;

    insert into public.push_tokens (user_id, token, platform)
    values (v_user_id, v_token, p_platform)
    on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();

    -- Only accept real IANA timezone names.
    v_timezone := null;

    if p_timezone is not null
       and exists (
            select 1
            from pg_catalog.pg_timezone_names tz
            where tz.name = p_timezone
       ) then
        v_timezone := p_timezone;
    end if;

    insert into public.notification_preferences (user_id, timezone)
    values (v_user_id, coalesce(v_timezone, 'Asia/Kolkata'))
    on conflict (user_id) do update
    set timezone = coalesce(v_timezone, public.notification_preferences.timezone);
end;
$$;


-- Removes this device's token (called on logout).
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        return;
    end if;

    delete from public.push_tokens pt
    where pt.token = trim(p_token)
      and pt.user_id = auth.uid();
end;
$$;


-- Saves the user's notification switches.
create or replace function public.save_notification_preferences(
    p_enabled boolean,
    p_reminders boolean,
    p_friend_activity boolean,
    p_leaderboard boolean,
    p_reminder_hour integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'You must be signed in to change notification settings';
    end if;

    if p_reminder_hour is null or p_reminder_hour not between 8 and 20 then
        raise exception 'Reminder time must be between 8 AM and 8 PM';
    end if;

    insert into public.notification_preferences (
        user_id,
        enabled,
        reminders,
        friend_activity,
        leaderboard,
        reminder_hour
    )
    values (
        v_user_id,
        coalesce(p_enabled, true),
        coalesce(p_reminders, true),
        coalesce(p_friend_activity, true),
        coalesce(p_leaderboard, true),
        p_reminder_hour::smallint
    )
    on conflict (user_id) do update
    set enabled = excluded.enabled,
        reminders = excluded.reminders,
        friend_activity = excluded.friend_activity,
        leaderboard = excluded.leaderboard,
        reminder_hour = excluded.reminder_hour;
end;
$$;


-- Marks a notification as opened (analytics only).
create or replace function public.mark_notification_opened(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        return;
    end if;

    update public.notification_log nl
    set opened_at = now()
    where nl.id = p_id
      and nl.user_id = auth.uid()
      and nl.opened_at is null;
end;
$$;


-- ============================================================
-- 5. SERVER-ONLY HELPERS
-- ============================================================

-- Weekly (Mon-Sun) points for one user.
create or replace function public.notification_week_points(
    p_user_id uuid,
    p_week_start date
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(sum(da.points_earned), 0)::integer
    from public.daily_activity da
    where da.user_id = p_user_id
      and da.activity_date between p_week_start and p_week_start + 6;
$$;


-- Everything that COULD be sent right now. The Edge Function applies
-- quiet hours, the daily cap, batching, dedupe and the copywriting.
--
-- kinds:
--   log_reminder  at the user's reminder hour, nothing logged today
--   streak_risk   21:00 local, alive streak (>= 2), day not yet qualified
--   friend_goal   a group mate hit their calorie goal (last 30 min)
--   overtaken     a group mate just passed you this week (last 30 min)
--   invite        pending group invitation (last 12 hours)
create or replace function public.get_notification_candidates(
    p_now timestamptz default now()
)
returns table (
    user_id uuid,
    kind text,
    event_key text,
    local_date date,
    local_hour integer,
    data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    with prefs as (
        select
            np.user_id as uid,
            np.reminders as want_reminders,
            np.friend_activity as want_friends,
            np.leaderboard as want_leaderboard,
            np.reminder_hour as reminder_hour,
            (p_now at time zone np.timezone)::date as local_day,
            extract(hour from (p_now at time zone np.timezone))::integer as local_hr,
            date_trunc('week', (p_now at time zone np.timezone))::date as week_start
        from public.notification_preferences np
        where np.enabled
          and np.timezone in (
                select tz.name from pg_catalog.pg_timezone_names tz
          )
          and exists (
                select 1
                from public.push_tokens pt
                where pt.user_id = np.user_id
          )
    ),

    -- ---------------------------------------------------------
    -- Daily "log your food" reminder
    -- ---------------------------------------------------------
    log_reminders as (
        select
            pr.uid as uid,
            'log_reminder'::text as kind,
            ('log_reminder:' || pr.local_day::text) as event_key,
            pr.local_day as local_day,
            pr.local_hr as local_hr,
            jsonb_build_object(
                'streak',
                    case
                        when us.last_qualifying_date >= pr.local_day - 1
                        then us.current_streak
                        else 0
                    end,
                'rival_name', rv.rival_name,
                'gap', rv.gap,
                'week_points',
                    public.notification_week_points(pr.uid, pr.week_start)
            ) as payload
        from prefs pr
        left join public.user_streaks us
          on us.user_id = pr.uid
        left join lateral (
            select g.rival_name, g.gap
            from (
                select
                    coalesce(nullif(trim(op.display_name), ''), op.username)
                        as rival_name,
                    (
                        public.notification_week_points(gm2.user_id, pr.week_start)
                        - public.notification_week_points(pr.uid, pr.week_start)
                    ) as gap
                from public.group_members gm1
                join public.group_members gm2
                  on gm2.group_id = gm1.group_id
                 and gm2.user_id <> gm1.user_id
                join public.profiles op
                  on op.id = gm2.user_id
                where gm1.user_id = pr.uid
            ) g
            where g.gap > 0
            order by g.gap asc, g.rival_name asc
            limit 1
        ) rv on true
        where pr.want_reminders
          and pr.local_hr = pr.reminder_hour
          and not exists (
                select 1
                from public.food_logs fl
                where fl.user_id = pr.uid
                  and fl.log_date = pr.local_day
          )
    ),

    -- ---------------------------------------------------------
    -- Streak at risk (21:00 local)
    -- ---------------------------------------------------------
    streak_risks as (
        select
            s.uid as uid,
            'streak_risk'::text as kind,
            ('streak_risk:' || s.local_day::text) as event_key,
            s.local_day as local_day,
            s.local_hr as local_hr,
            jsonb_build_object(
                'streak', s.current_streak,
                'entries', s.entries,
                'consumed', s.consumed,
                'goal', s.goal
            ) as payload
        from (
            select
                pr.uid as uid,
                pr.local_day as local_day,
                pr.local_hr as local_hr,
                us.current_streak as current_streak,
                (
                    select count(*)
                    from public.food_logs fl
                    where fl.user_id = pr.uid
                      and fl.log_date = pr.local_day
                )::integer as entries,
                (
                    select coalesce(sum(fl.calories), 0)
                    from public.food_logs fl
                    where fl.user_id = pr.uid
                      and fl.log_date = pr.local_day
                )::numeric as consumed,
                coalesce(
                    (
                        select da.calorie_goal
                        from public.daily_activity da
                        where da.user_id = pr.uid
                          and da.activity_date = pr.local_day
                    ),
                    (
                        select cg.daily_calories
                        from public.calorie_goals cg
                        where cg.user_id = pr.uid
                          and cg.effective_at <= p_now
                        order by cg.effective_at desc, cg.created_at desc
                        limit 1
                    )
                ) as goal
            from prefs pr
            join public.user_streaks us
              on us.user_id = pr.uid
            where pr.want_reminders
              and pr.local_hr = 21
              and us.current_streak >= 2
              and us.last_qualifying_date = pr.local_day - 1
              and not exists (
                    select 1
                    from public.daily_activity da2
                    where da2.user_id = pr.uid
                      and da2.activity_date = pr.local_day
                      and da2.qualifying_day
              )
        ) s
        -- If they are already past 105% the day can no longer qualify,
        -- so a "save your streak" ping would be misleading.
        where s.goal is not null
          and s.consumed <= s.goal * 1.05
    ),

    -- ---------------------------------------------------------
    -- A group mate hit their calorie goal
    -- ---------------------------------------------------------
    goal_events as (
        select
            pt.id as tx_id,
            pt.user_id as actor
        from public.point_transactions pt
        where pt.activity_type = 'calorie_goal_completed'
          and pt.created_at >= p_now - interval '30 minutes'
          and pt.created_at <= p_now
    ),

    friend_goals as (
        select distinct on (pr.uid, ge.tx_id)
            pr.uid as uid,
            'friend_goal'::text as kind,
            ('friend_goal:' || ge.tx_id::text) as event_key,
            pr.local_day as local_day,
            pr.local_hr as local_hr,
            jsonb_build_object(
                'actor_name',
                coalesce(nullif(trim(ap.display_name), ''), ap.username)
            ) as payload
        from goal_events ge
        join public.profiles ap
          on ap.id = ge.actor
        join public.group_members gm_a
          on gm_a.user_id = ge.actor
        join public.group_members gm_r
          on gm_r.group_id = gm_a.group_id
         and gm_r.user_id <> ge.actor
        join prefs pr
          on pr.uid = gm_r.user_id
         and pr.want_friends
        order by pr.uid, ge.tx_id
    ),

    -- ---------------------------------------------------------
    -- A group mate just passed you on the weekly leaderboard
    -- ---------------------------------------------------------
    recent_points as (
        select
            pt.user_id as actor,
            date_trunc('week', pt.activity_date::timestamp)::date as week_start,
            sum(pt.points)::integer as recent
        from public.point_transactions pt
        where pt.created_at >= p_now - interval '30 minutes'
          and pt.created_at <= p_now
        group by
            pt.user_id,
            date_trunc('week', pt.activity_date::timestamp)::date
    ),

    overtakes as (
        select distinct on (gm_b.user_id, rp.actor, rp.week_start)
            gm_b.user_id as victim,
            rp.actor as actor,
            rp.week_start as week_start,
            gm_a.group_id as group_id,
            tot.a_after as a_after,
            tot.b_total as b_total
        from recent_points rp
        join public.group_members gm_a
          on gm_a.user_id = rp.actor
        join public.group_members gm_b
          on gm_b.group_id = gm_a.group_id
         and gm_b.user_id <> rp.actor
        cross join lateral (
            select
                public.notification_week_points(rp.actor, rp.week_start)
                    as a_after,
                public.notification_week_points(gm_b.user_id, rp.week_start)
                    as b_total
        ) tot
        -- The victim must have points of their own (no "passed you" at 0),
        -- the actor is now strictly ahead, and before the recent points
        -- the actor was not ahead.
        where tot.b_total > 0
          and tot.a_after > tot.b_total
          and (tot.a_after - rp.recent) <= tot.b_total
        order by gm_b.user_id, rp.actor, rp.week_start, gm_a.group_id
    ),

    overtaken_rows as (
        select
            pr.uid as uid,
            'overtaken'::text as kind,
            (
                'overtaken:' || ov.actor::text
                || ':' || ov.week_start::text
                || ':' || ov.a_after::text
            ) as event_key,
            pr.local_day as local_day,
            pr.local_hr as local_hr,
            jsonb_build_object(
                'actor_name',
                    coalesce(nullif(trim(ap.display_name), ''), ap.username),
                'gap', ov.a_after - ov.b_total,
                'group_id', ov.group_id,
                'group_name', grp.name
            ) as payload
        from overtakes ov
        join prefs pr
          on pr.uid = ov.victim
         and pr.want_leaderboard
         and pr.week_start = ov.week_start
        join public.profiles ap
          on ap.id = ov.actor
        join public.groups grp
          on grp.id = ov.group_id
    ),

    -- ---------------------------------------------------------
    -- Pending group invitations
    -- ---------------------------------------------------------
    invite_rows as (
        select
            pr.uid as uid,
            'invite'::text as kind,
            ('invite:' || gi.id::text) as event_key,
            pr.local_day as local_day,
            pr.local_hr as local_hr,
            jsonb_build_object(
                'inviter_name',
                    coalesce(nullif(trim(ip.display_name), ''), ip.username),
                'group_id', gi.group_id,
                'group_name', grp.name
            ) as payload
        from public.group_invitations gi
        join prefs pr
          on pr.uid = gi.invitee_user_id
         and pr.want_friends
        join public.profiles ip
          on ip.id = gi.inviter_user_id
        join public.groups grp
          on grp.id = gi.group_id
        where gi.status = 'pending'
          and gi.created_at >= p_now - interval '12 hours'
    )

    select
        x.uid,
        x.kind,
        x.event_key,
        x.local_day,
        x.local_hr,
        x.payload
    from (
        select * from log_reminders
        union all
        select * from streak_risks
        union all
        select * from friend_goals
        union all
        select * from overtaken_rows
        union all
        select * from invite_rows
    ) x;
$$;


-- ============================================================
-- 6. FUNCTION PERMISSIONS
-- ============================================================

revoke all on function
    public.register_push_token(text, text, text),
    public.unregister_push_token(text),
    public.save_notification_preferences(boolean, boolean, boolean, boolean, integer),
    public.mark_notification_opened(uuid),
    public.notification_week_points(uuid, date),
    public.get_notification_candidates(timestamptz)
from public, anon, authenticated;

grant execute on function public.register_push_token(text, text, text)
    to authenticated;

grant execute on function public.unregister_push_token(text)
    to authenticated;

grant execute on function
    public.save_notification_preferences(boolean, boolean, boolean, boolean, integer)
    to authenticated;

grant execute on function public.mark_notification_opened(uuid)
    to authenticated;

-- Server-only.
grant execute on function public.notification_week_points(uuid, date)
    to service_role;

grant execute on function public.get_notification_candidates(timestamptz)
    to service_role;


-- ============================================================
-- END OF NOTIFICATIONS FOUNDATION
-- ============================================================
