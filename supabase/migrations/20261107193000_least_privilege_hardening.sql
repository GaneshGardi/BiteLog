-- ============================================================
-- BiteLog: Least-privilege database hardening
-- ============================================================

-- 1. Remove broad direct permissions from client roles.
REVOKE ALL PRIVILEGES ON TABLE
    public.profiles,
    public.calorie_goals,
    public.food_logs,
    public.foods,
    public.groups,
    public.group_members,
    public.group_invitations
FROM PUBLIC, anon, authenticated;


-- 2. Grant only the operations required by BiteLog.

-- Profiles: read and update own profile.
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;

-- Calorie goals: read and insert historical goals.
GRANT SELECT, INSERT
ON TABLE public.calorie_goals
TO authenticated;

-- Food logs: read, insert and delete own entries.
GRANT SELECT, INSERT, DELETE
ON TABLE public.food_logs
TO authenticated;

-- Foods: required by the JWT-based log-food function.
GRANT SELECT
ON TABLE public.foods
TO authenticated;

-- Groups and memberships: read only.
GRANT SELECT
ON TABLE public.groups, public.group_members
TO authenticated;

-- Invitations: all operations use protected RPC functions.
-- No direct table permissions are granted.


-- 3. Remove existing client execution privileges
-- from every function in the public schema.
REVOKE EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC, anon, authenticated;


-- 4. Explicitly grant only the eight approved app RPCs.

GRANT EXECUTE ON FUNCTION public.create_group(text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_group_daily_progress(uuid, date)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.get_group_weekly_history(uuid, date, date, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_group_invitations()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.respond_to_group_invitation(uuid, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.search_users_for_invites(text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.send_group_invitation(uuid, text)
TO authenticated;


-- 5. Restrict default table permissions for future
-- objects created by postgres in the public schema.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON SEQUENCES FROM anon, authenticated;


-- 6. Restrict default function permissions.
-- The PUBLIC revoke is global for future functions
-- created by postgres, across schemas.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;


-- ============================================================
-- End of BiteLog permission hardening
-- ============================================================
