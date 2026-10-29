-- Daily oatcakes for Pickle: the first visit each day (the day the streak ticks up) drops two
-- extra oatcakes in the tin. A business's shared Pickle gets two a day however many of its logins
-- visit. The database hands it out, not the browser: only pet_visit() moves the streak and the
-- bonus count, so nobody can award themselves extra.
alter table public.pets add column if not exists bonus integer not null default 0;
alter table public.business_pets add column if not exists bonus integer not null default 0;

-- Logins can still hatch and feed their Pickle, but no longer set the streak or bonus directly.
revoke insert, update on public.pets, public.business_pets from anon, authenticated;
grant insert (owner_email, earned_base, last_fed_at, last_visit, streak, best_streak) on public.pets to authenticated;
grant insert (business_id, earned_base, last_fed_at, last_visit, streak, best_streak) on public.business_pets to authenticated;
grant update (fed, golden, last_fed_at, last_golden_at) on public.pets, public.business_pets to authenticated;

-- Counts today's visit (London days) for your own Pickle, or a business's you request for, and
-- returns the pet with `gift` true when this visit earned the day's oatcakes.
create or replace function public.pet_visit(p_business uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  pet jsonb;
begin
  if p_business is null then
    update pets set last_visit = today,
      streak = case when last_visit = today - 1 then streak + 1 else 1 end,
      best_streak = greatest(best_streak, case when last_visit = today - 1 then streak + 1 else 1 end),
      bonus = bonus + 2
    where owner_email = public.my_email() and last_visit is distinct from today
    returning to_jsonb(pets.*) into pet;
    if pet is null then select to_jsonb(p.*) into pet from pets p where owner_email = public.my_email(); return pet || '{"gift":false}'; end if;
  else
    if not (p_business = any (public.my_businesses())) then return null; end if;
    update business_pets set last_visit = today,
      streak = case when last_visit = today - 1 then streak + 1 else 1 end,
      best_streak = greatest(best_streak, case when last_visit = today - 1 then streak + 1 else 1 end),
      bonus = bonus + 2
    where business_id = p_business and last_visit is distinct from today
    returning to_jsonb(business_pets.*) into pet;
    if pet is null then select to_jsonb(b.*) into pet from business_pets b where business_id = p_business; return pet || '{"gift":false}'; end if;
  end if;
  return pet || '{"gift":true}';
end $$;

revoke execute on function public.pet_visit(uuid) from public, anon;
grant execute on function public.pet_visit(uuid) to authenticated;
