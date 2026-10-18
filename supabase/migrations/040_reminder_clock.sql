-- The clock for calendar reminders. Vercel only runs our scheduled jobs once a day on this plan,
-- so the database knocks on /api/cron/reminders every five minutes instead. It sends the alerts
-- secret it already keeps (private_settings), so the secret never sits in the job itself.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('oatcake-reminders', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://oatcake.xyz/api/cron/reminders',
    headers := jsonb_build_object('authorization', 'Bearer ' || (select value from public.private_settings where name = 'push_secret'))
  )
$$);
