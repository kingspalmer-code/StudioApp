-- Your own days on Oatcake, for the Days active widget: each UK day you used it since p_from, with
-- how long you were actively on it. The activity table itself stays admins-only to read, so this
-- only ever returns the signed-in person's own totals.
create or replace function public.my_active_days(p_from date)
returns table (day date, ms bigint)
language sql stable security definer set search_path = public as $$
  select (x.created_at at time zone 'Europe/London')::date, coalesce(sum(x.ms), 0)::bigint
  from activity x
  where x.user_id = (select auth.uid())
    and x.created_at >= greatest(p_from, (now() at time zone 'Europe/London')::date - 400)::timestamp at time zone 'Europe/London'
  group by 1
  order by 1;
$$;

revoke execute on function public.my_active_days(date) from public, anon;
grant execute on function public.my_active_days(date) to authenticated;
