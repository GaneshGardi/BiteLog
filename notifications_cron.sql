-- ============================================================
-- BITELOG: schedule the notification sender
-- ============================================================
-- Run this ONCE in the Supabase SQL editor (NOT as a migration,
-- because it contains your project URL and secret).
--
-- Before running:
--   1. supabase secrets set CRON_SECRET=<a long random string>
--   2. supabase functions deploy send-notifications --no-verify-jwt
--   3. Replace <PROJECT_REF> and <CRON_SECRET> below.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
    'bitelog-send-notifications',
    '*/5 * * * *',
    $$
    select net.http_post(
        url := 'https://https://lmazyzhpbquromjhxdqb.supabase.co/functions/v1/send-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', 'wxjSYlTlb6hM2cJYAiyAJc1YcePGL3xmEKlZj973sQo='
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
    );
    $$
);

-- Useful afterwards:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
--
-- To stop it:
--   select cron.unschedule('bitelog-send-notifications');
