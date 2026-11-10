-- ============================================================
-- BITELOG: GAMIFICATION REWARD ENGINE
-- ============================================================
-- Rewards:
--   Food logging:       +2 points once per day
--   Consistency:        +3 points at 3 food entries
--   Calorie goal:      +10 points at 85%-105% of goal
--   Maximum:           15 points per day
--
-- Streak qualification:
--   At least 2 food entries
--   Calories between 85%-105% of the locked daily goal
--
-- Goal locking:
--   The goal is snapshotted when the first food entry is logged.
--   Later goal changes apply to the next day.
--
-- Rewards are immutable once earned.
-- Clients cannot directly award points or badges.
-- ============================================================


-- ============================================================
-- 1. DAILY ACTIVITY RECALCULATION
-- ============================================================

create or replace function public.recalculate_daily_activity(
    p_user_id uuid,
    p_activity_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_food_log_count integer := 0;
    v_calories_consumed numeric(10,2) := 0;
    v_calorie_goal numeric(7,2);
    v_activity_exists boolean := false;
    v_currently_qualifying boolean := false;
    v_qualifying_day boolean := false;
    v_current_streak integer := 0;
begin

    -- --------------------------------------------------------
    -- Calculate current food-log totals.
    -- --------------------------------------------------------

    select
        count(*)::integer,
        coalesce(sum(fl.calories), 0)::numeric(10,2)
    into
        v_food_log_count,
        v_calories_consumed
    from public.food_logs fl
    where fl.user_id = p_user_id
      and fl.log_date = p_activity_date;


    -- --------------------------------------------------------
    -- Retrieve the locked goal if this day's activity exists.
    --
    -- IMPORTANT:
    -- FOUND distinguishes an existing activity row with a
    -- NULL goal from a day that has not yet been initialized.
    -- --------------------------------------------------------

    select da.calorie_goal
    into v_calorie_goal
    from public.daily_activity da
    where da.user_id = p_user_id
      and da.activity_date = p_activity_date;

    v_activity_exists := found;


    -- --------------------------------------------------------
    -- First food entry of the day:
    -- snapshot the latest calorie goal.
    --
    -- Subsequent recalculations preserve the snapshot,
    -- including when the snapshot is NULL.
    -- --------------------------------------------------------

    if not v_activity_exists then

        select cg.daily_calories
        into v_calorie_goal
        from public.calorie_goals cg
        where cg.user_id = p_user_id
          and cg.effective_at <= now()
        order by cg.effective_at desc, cg.created_at desc
        limit 1;

    end if;


    -- --------------------------------------------------------
    -- Determine whether the current totals qualify.
    -- --------------------------------------------------------

    v_currently_qualifying :=
        v_food_log_count >= 2
        and v_calorie_goal is not null
        and v_calories_consumed >= v_calorie_goal * 0.85
        and v_calories_consumed <= v_calorie_goal * 1.05;


    -- --------------------------------------------------------
    -- Create or update daily activity.
    --
    -- The calorie_goal is intentionally NOT overwritten
    -- during an update. It remains the first-log snapshot.
    --
    -- Qualification is also permanent once achieved.
    -- --------------------------------------------------------

    insert into public.daily_activity (
        user_id,
        activity_date,
        food_log_count,
        calories_consumed,
        calorie_goal,
        qualifying_day,
        updated_at
    )
    values (
        p_user_id,
        p_activity_date,
        v_food_log_count,
        v_calories_consumed,
        v_calorie_goal,
        v_currently_qualifying,
        now()
    )
    on conflict (user_id, activity_date)
    do update set
        food_log_count = excluded.food_log_count,
        calories_consumed = excluded.calories_consumed,
        qualifying_day =
            public.daily_activity.qualifying_day
            or excluded.qualifying_day,
        updated_at = now();


    -- Read the persistent qualification state.
    select da.qualifying_day
    into v_qualifying_day
    from public.daily_activity da
    where da.user_id = p_user_id
      and da.activity_date = p_activity_date;


    -- ========================================================
    -- 2. FOOD LOGGING REWARD: +2
    -- ========================================================

    if v_food_log_count >= 1 then

        insert into public.point_transactions (
            user_id,
            activity_date,
            activity_type,
            points,
            description,
            metadata
        )
        values (
            p_user_id,
            p_activity_date,
            'food_logged',
            2,
            'Logged food for the day',
            jsonb_build_object(
                'food_log_count', v_food_log_count
            )
        )
        on conflict (user_id, activity_date, activity_type)
        do nothing;

    end if;


    -- ========================================================
    -- 3. CONSISTENCY REWARD: +3
    -- ========================================================

    if v_food_log_count >= 3 then

        insert into public.point_transactions (
            user_id,
            activity_date,
            activity_type,
            points,
            description,
            metadata
        )
        values (
            p_user_id,
            p_activity_date,
            'consistency_bonus',
            3,
            'Logged at least 3 food entries',
            jsonb_build_object(
                'food_log_count', v_food_log_count
            )
        )
        on conflict (user_id, activity_date, activity_type)
        do nothing;

    end if;


    -- ========================================================
    -- 4. CALORIE GOAL REWARD: +10
    -- ========================================================

    if v_calorie_goal is not null
       and v_calories_consumed >= v_calorie_goal * 0.85
       and v_calories_consumed <= v_calorie_goal * 1.05
    then

        insert into public.point_transactions (
            user_id,
            activity_date,
            activity_type,
            points,
            description,
            metadata
        )
        values (
            p_user_id,
            p_activity_date,
            'calorie_goal_completed',
            10,
            'Reached the daily calorie target range',
            jsonb_build_object(
                'calories_consumed', v_calories_consumed,
                'calorie_goal', v_calorie_goal
            )
        )
        on conflict (user_id, activity_date, activity_type)
        do nothing;


        -- Award On Target badge once.
        insert into public.user_badges (
            user_id,
            badge_id,
            metadata
        )
        select
            p_user_id,
            b.id,
            jsonb_build_object(
                'activity_date', p_activity_date
            )
        from public.badges b
        where b.code = 'on_target'
        on conflict (user_id, badge_id)
        do nothing;

    end if;


    -- ========================================================
    -- 5. FIRST LOG BADGE
    -- ========================================================

    -- Award only when this is the user's first logged date.
    -- Multiple entries on that first date still qualify.

    if v_food_log_count >= 1
       and not exists (
            select 1
            from public.food_logs fl
            where fl.user_id = p_user_id
              and fl.log_date < p_activity_date
       )
    then

        insert into public.user_badges (
            user_id,
            badge_id,
            metadata
        )
        select
            p_user_id,
            b.id,
            jsonb_build_object(
                'activity_date', p_activity_date
            )
        from public.badges b
        where b.code = 'first_log'
        on conflict (user_id, badge_id)
        do nothing;

    end if;


    -- ========================================================
    -- 6. UPDATE DAILY POINT TOTAL
    -- ========================================================

    update public.daily_activity da
    set
        points_earned = least(
            15,
            (
                select coalesce(sum(pt.points), 0)::integer
                from public.point_transactions pt
                where pt.user_id = p_user_id
                  and pt.activity_date = p_activity_date
            )
        ),
        updated_at = now()
    where da.user_id = p_user_id
      and da.activity_date = p_activity_date;


    -- ========================================================
    -- 7. STREAK CALCULATION
    -- ========================================================

    if v_qualifying_day then

        insert into public.user_streaks (
            user_id,
            current_streak,
            longest_streak,
            last_qualifying_date,
            updated_at
        )
        values (
            p_user_id,
            1,
            1,
            p_activity_date,
            now()
        )
        on conflict (user_id)
        do update set

            current_streak =
                case
                    when public.user_streaks.last_qualifying_date
                         = p_activity_date - 1
                    then public.user_streaks.current_streak + 1
                    else 1
                end,

            longest_streak = greatest(
                public.user_streaks.longest_streak,
                case
                    when public.user_streaks.last_qualifying_date
                         = p_activity_date - 1
                    then public.user_streaks.current_streak + 1
                    else 1
                end
            ),

            last_qualifying_date = excluded.last_qualifying_date,
            updated_at = now()

        -- Same date cannot increment the streak twice.
        -- Older dates cannot move the streak backwards.
        where public.user_streaks.last_qualifying_date is null
           or public.user_streaks.last_qualifying_date
              < excluded.last_qualifying_date;


        select us.current_streak
        into v_current_streak
        from public.user_streaks us
        where us.user_id = p_user_id;


        -- ----------------------------------------------------
        -- 8. STREAK BADGES
        -- ----------------------------------------------------

        if v_current_streak >= 3 then

            insert into public.user_badges (
                user_id,
                badge_id,
                metadata
            )
            select
                p_user_id,
                b.id,
                jsonb_build_object(
                    'current_streak', v_current_streak,
                    'activity_date', p_activity_date
                )
            from public.badges b
            where b.code = 'streak_3'
            on conflict (user_id, badge_id)
            do nothing;

        end if;


        if v_current_streak >= 7 then

            insert into public.user_badges (
                user_id,
                badge_id,
                metadata
            )
            select
                p_user_id,
                b.id,
                jsonb_build_object(
                    'current_streak', v_current_streak,
                    'activity_date', p_activity_date
                )
            from public.badges b
            where b.code = 'streak_7'
            on conflict (user_id, badge_id)
            do nothing;

        end if;

    end if;

end;
$$;


-- ============================================================
-- 9. FOOD LOG TRIGGER FUNCTION
-- ============================================================

create or replace function public.handle_food_log_gamification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

    if TG_OP = 'INSERT' then

        perform public.recalculate_daily_activity(
            NEW.user_id,
            NEW.log_date
        );

        return NEW;

    elsif TG_OP = 'DELETE' then

        perform public.recalculate_daily_activity(
            OLD.user_id,
            OLD.log_date
        );

        return OLD;

    elsif TG_OP = 'UPDATE' then

        perform public.recalculate_daily_activity(
            OLD.user_id,
            OLD.log_date
        );

        if OLD.user_id is distinct from NEW.user_id
           or OLD.log_date is distinct from NEW.log_date
        then

            perform public.recalculate_daily_activity(
                NEW.user_id,
                NEW.log_date
            );

        end if;

        return NEW;

    end if;

    return null;

end;
$$;


-- ============================================================
-- 10. FOOD LOG TRIGGER
-- ============================================================

drop trigger if exists food_logs_gamification
on public.food_logs;

create trigger food_logs_gamification
after insert or update or delete
on public.food_logs
for each row
execute function public.handle_food_log_gamification();


-- ============================================================
-- 11. REMOVE OLD CALORIE GOAL REWARD TRIGGER
-- ============================================================

-- Goal changes must not recalculate an already-started day.
-- The first food log has already locked that day's goal.
-- The new goal will be picked up when the next day gets
-- its first food entry.

drop trigger if exists calorie_goals_gamification
on public.calorie_goals;

drop function if exists public.handle_calorie_goal_gamification();


-- ============================================================
-- 12. FUNCTION PERMISSIONS
-- ============================================================

revoke all on function
    public.recalculate_daily_activity(uuid, date)
from public, anon, authenticated;

revoke all on function
    public.handle_food_log_gamification()
from public, anon, authenticated;


-- Trusted server-side role retains access.
grant execute on function
    public.recalculate_daily_activity(uuid, date)
to service_role;

grant execute on function
    public.handle_food_log_gamification()
to service_role;


-- ============================================================
-- END OF GAMIFICATION REWARD ENGINE
-- ============================================================