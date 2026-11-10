
-- ============================================================
-- BITELOG: GAMIFICATION FOUNDATION
-- ============================================================
-- Creates:
--   1. daily_activity
--   2. point_transactions
--   3. user_streaks
--   4. badges
--   5. user_badges
--
-- Reward calculation and awarding will be implemented
-- separately through trusted server-side logic.
-- ============================================================


-- ============================================================
-- 1. DAILY ACTIVITY
-- ============================================================

create table public.daily_activity (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    activity_date date not null,

    food_log_count integer not null default 0,
    calories_consumed numeric(10,2) not null default 0,
    calorie_goal numeric(10,2),

    points_earned integer not null default 0,

    qualifying_day boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint daily_activity_food_count_non_negative
        check (food_log_count >= 0),

    constraint daily_activity_calories_non_negative
        check (calories_consumed >= 0),

    constraint daily_activity_goal_positive
        check (calorie_goal is null or calorie_goal > 0),

    constraint daily_activity_points_valid
        check (points_earned between 0 and 15),

    constraint daily_activity_user_date_unique
        unique (user_id, activity_date)
);

create index daily_activity_user_date_idx
    on public.daily_activity (user_id, activity_date desc);

create index daily_activity_date_points_idx
    on public.daily_activity (activity_date desc, points_earned desc);


-- ============================================================
-- 2. POINT TRANSACTIONS
-- ============================================================

create table public.point_transactions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    activity_date date not null,

    activity_type text not null,

    points integer not null,

    description text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint point_transaction_type_valid
        check (
            activity_type in (
                'food_logged',
                'consistency_bonus',
                'calorie_goal_completed'
            )
        ),

    constraint point_transaction_points_positive
        check (points > 0),

    constraint point_transaction_metadata_object
        check (jsonb_typeof(metadata) = 'object'),

    constraint point_transaction_daily_activity_unique
        unique (user_id, activity_date, activity_type)
);

create index point_transactions_user_date_idx
    on public.point_transactions (user_id, activity_date desc);

create index point_transactions_created_idx
    on public.point_transactions (created_at desc);


-- ============================================================
-- 3. USER STREAKS
-- ============================================================

create table public.user_streaks (
    user_id uuid primary key
        references public.profiles(id)
        on delete cascade,

    current_streak integer not null default 0,
    longest_streak integer not null default 0,

    last_qualifying_date date,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint user_streak_current_non_negative
        check (current_streak >= 0),

    constraint user_streak_longest_non_negative
        check (longest_streak >= 0),

    constraint user_streak_longest_valid
        check (longest_streak >= current_streak)
);


-- ============================================================
-- 4. BADGES
-- ============================================================

create table public.badges (
    id uuid primary key default gen_random_uuid(),

    code text not null unique,

    name text not null,

    description text not null,

    icon text,

    criteria jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint badge_code_not_empty
        check (length(trim(code)) > 0),

    constraint badge_name_not_empty
        check (length(trim(name)) > 0),

    constraint badge_criteria_object
        check (jsonb_typeof(criteria) = 'object')
);


-- Initial badge catalog.
-- Protein Pro is intentionally deferred until protein goals exist.

insert into public.badges (
    code,
    name,
    description,
    icon,
    criteria
)
values
(
    'first_log',
    'First Log',
    'Log your first food entry.',
    '🍎',
    '{"type": "food_log_count", "threshold": 1}'::jsonb
),
(
    'streak_3',
    '3-Day Streak',
    'Complete three qualifying days in a row.',
    '🔥',
    '{"type": "streak", "threshold": 3}'::jsonb
),
(
    'streak_7',
    '7-Day Streak',
    'Complete seven qualifying days in a row.',
    '🏆',
    '{"type": "streak", "threshold": 7}'::jsonb
),
(
    'on_target',
    'On Target',
    'Reach your daily calorie target range.',
    '🎯',
    '{"type": "calorie_goal_completed", "threshold": 1}'::jsonb
)
on conflict (code) do nothing;


-- ============================================================
-- 5. USER BADGES
-- ============================================================

create table public.user_badges (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    badge_id uuid not null
        references public.badges(id)
        on delete cascade,

    earned_at timestamptz not null default now(),

    metadata jsonb not null default '{}'::jsonb,

    constraint user_badge_metadata_object
        check (jsonb_typeof(metadata) = 'object'),

    constraint user_badge_unique
        unique (user_id, badge_id)
);

create index user_badges_user_earned_idx
    on public.user_badges (user_id, earned_at desc);

create index user_badges_badge_idx
    on public.user_badges (badge_id);


-- ============================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.daily_activity
    enable row level security;

alter table public.point_transactions
    enable row level security;

alter table public.user_streaks
    enable row level security;

alter table public.badges
    enable row level security;

alter table public.user_badges
    enable row level security;


-- ============================================================
-- 7. DAILY ACTIVITY POLICIES
-- ============================================================

-- Users can see their own activity and activity of members
-- who share at least one group with them.

create policy "Users can view shared daily activity"
on public.daily_activity
for select
to authenticated
using (
    auth.uid() = user_id
    or exists (
        select 1
        from public.group_members target_member
        where target_member.user_id = daily_activity.user_id
          and public.is_group_member(target_member.group_id)
    )
);


-- ============================================================
-- 8. POINT TRANSACTION POLICIES
-- ============================================================

-- Individual point transactions remain private.

create policy "Users can view their own point transactions"
on public.point_transactions
for select
to authenticated
using (
    auth.uid() = user_id
);


-- ============================================================
-- 9. USER STREAK POLICIES
-- ============================================================

create policy "Users can view shared user streaks"
on public.user_streaks
for select
to authenticated
using (
    auth.uid() = user_id
    or exists (
        select 1
        from public.group_members target_member
        where target_member.user_id = user_streaks.user_id
          and public.is_group_member(target_member.group_id)
    )
);


-- ============================================================
-- 10. BADGE CATALOG POLICIES
-- ============================================================

-- All authenticated users can read the badge catalog.

create policy "Authenticated users can view badges"
on public.badges
for select
to authenticated
using (true);


-- ============================================================
-- 11. USER BADGE POLICIES
-- ============================================================

create policy "Users can view shared earned badges"
on public.user_badges
for select
to authenticated
using (
    auth.uid() = user_id
    or exists (
        select 1
        from public.group_members target_member
        where target_member.user_id = user_badges.user_id
          and public.is_group_member(target_member.group_id)
    )
);


-- ============================================================
-- 12. CLIENT PERMISSIONS
-- ============================================================

-- Clients can read gamification data but cannot directly
-- insert, update, or delete points, activity, streaks or badges.

revoke all on table public.daily_activity
    from public, anon, authenticated;

revoke all on table public.point_transactions
    from public, anon, authenticated;

revoke all on table public.user_streaks
    from public, anon, authenticated;

revoke all on table public.badges
    from public, anon, authenticated;

revoke all on table public.user_badges
    from public, anon, authenticated;


grant select on table public.daily_activity
    to authenticated;

grant select on table public.point_transactions
    to authenticated;

grant select on table public.user_streaks
    to authenticated;

grant select on table public.badges
    to authenticated;

grant select on table public.user_badges
    to authenticated;


-- Trusted server-side operations retain full table access.

grant all on table public.daily_activity to service_role;
grant all on table public.point_transactions to service_role;
grant all on table public.user_streaks to service_role;
grant all on table public.badges to service_role;
grant all on table public.user_badges to service_role;


-- ============================================================
-- END OF GAMIFICATION FOUNDATION
-- ============================================================
