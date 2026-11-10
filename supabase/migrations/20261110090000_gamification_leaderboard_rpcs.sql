-- ============================================================
-- BITELOG: GAMIFICATION LEADERBOARD READ FUNCTIONS
-- ============================================================
-- Adds two read-only functions used by the app:
--
--   1. get_group_leaderboard(p_group_id, p_today)
--      Weekly (Mon-Sun) ranking of one group's members.
--
--   2. get_my_group_ranks(p_today)
--      The caller's weekly rank in each group they belong to.
--
-- Nothing here awards points. Points, streaks and badges are
-- still created only by recalculate_daily_activity().
--
-- p_today is the device's LOCAL calendar date, the same
-- convention the app already uses for food_logs.log_date.
-- The week is the Monday-Sunday week containing p_today.
-- ============================================================


-- ------------------------------------------------------------
-- 1. GROUP LEADERBOARD
-- ------------------------------------------------------------

create or replace function public.get_group_leaderboard(
    p_group_id uuid,
    p_today date
)
returns table (
    user_id uuid,
    username text,
    display_name text,
    week_start date,
    week_points integer,
    today_points integer,
    current_streak integer,
    day_points integer[],
    rank integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_week_start date;
begin
    -- Only authenticated members of this group may view it.
    if auth.uid() is null
       or not public.is_group_member(p_group_id) then
        raise exception 'Not authorized to view this group'
            using errcode = '42501';
    end if;

    if p_today is null then
        raise exception 'Date is required'
            using errcode = '22023';
    end if;

    -- date_trunc('week') returns the Monday of that week.
    v_week_start := date_trunc('week', p_today::timestamp)::date;

    return query
    with member_stats as (
        select
            gm.user_id as uid,
            p.username as uname,
            p.display_name as dname,

            coalesce(
                (
                    select sum(da.points_earned)
                    from public.daily_activity as da
                    where da.user_id = gm.user_id
                      and da.activity_date between v_week_start
                                               and v_week_start + 6
                ),
                0
            )::integer as wpts,

            coalesce(
                (
                    select da.points_earned
                    from public.daily_activity as da
                    where da.user_id = gm.user_id
                      and da.activity_date = p_today
                ),
                0
            )::integer as tpts,

            -- A stored streak is only still alive if the last
            -- qualifying day was yesterday or today.
            case
                when us.last_qualifying_date is not null
                     and us.last_qualifying_date >= p_today - 1
                then us.current_streak
                else 0
            end::integer as streak,

            array(
                select coalesce(
                    (
                        select da2.points_earned
                        from public.daily_activity as da2
                        where da2.user_id = gm.user_id
                          and da2.activity_date = v_week_start + gs.i
                    ),
                    0
                )::integer
                from generate_series(0, 6) as gs(i)
                order by gs.i
            ) as dpts

        from public.group_members as gm
        join public.profiles as p
          on p.id = gm.user_id
        left join public.user_streaks as us
          on us.user_id = gm.user_id
        where gm.group_id = p_group_id
    ),
    ranked as (
        select
            ms.*,
            (rank() over (order by ms.wpts desc))::integer as rnk
        from member_stats as ms
    )
    select
        r.uid,
        r.uname,
        r.dname,
        v_week_start,
        r.wpts,
        r.tpts,
        r.streak,
        r.dpts,
        r.rnk
    from ranked as r
    order by
        r.rnk,
        r.streak desc,
        lower(coalesce(r.dname, r.uname)),
        lower(r.uname);
end;
$$;

revoke all
on function public.get_group_leaderboard(uuid, date)
from public;

grant execute
on function public.get_group_leaderboard(uuid, date)
to authenticated;


-- ------------------------------------------------------------
-- 2. MY RANK IN EACH GROUP
-- ------------------------------------------------------------

create or replace function public.get_my_group_ranks(
    p_today date
)
returns table (
    group_id uuid,
    group_name text,
    member_count integer,
    my_rank integer,
    my_points integer,
    points_to_next integer
)
language sql
stable
security definer
set search_path = ''
as $$
    with params as (
        select date_trunc('week', p_today::timestamp)::date as week_start
    ),
    my_groups as (
        select gm.group_id as gid
        from public.group_members as gm
        where gm.user_id = (select auth.uid())
    ),
    totals as (
        select
            gm.group_id as gid,
            gm.user_id as uid,
            coalesce(sum(da.points_earned), 0)::integer as pts
        from public.group_members as gm
        join my_groups as mg
          on mg.gid = gm.group_id
        cross join params as pr
        left join public.daily_activity as da
          on da.user_id = gm.user_id
         and da.activity_date between pr.week_start
                                  and pr.week_start + 6
        group by gm.group_id, gm.user_id
    ),
    ranked as (
        select
            t.gid,
            t.uid,
            t.pts,
            (rank() over (partition by t.gid order by t.pts desc))::integer
                as rnk,
            (count(*) over (partition by t.gid))::integer as cnt
        from totals as t
    )
    select
        g.id,
        g.name,
        r.cnt,
        r.rnk,
        r.pts,
        (
            select min(o.pts) - r.pts
            from ranked as o
            where o.gid = r.gid
              and o.pts > r.pts
        )::integer
    from ranked as r
    join public.groups as g
      on g.id = r.gid
    where r.uid = (select auth.uid())
    order by r.rnk, r.cnt desc, g.created_at;
$$;

revoke all
on function public.get_my_group_ranks(date)
from public;

grant execute
on function public.get_my_group_ranks(date)
to authenticated;


-- ============================================================
-- END OF GAMIFICATION LEADERBOARD READ FUNCTIONS
-- ============================================================