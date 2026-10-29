-- Pickle's World: a shop, a wardrobe, an arcade and a bakery, and a new economy where everything earns more
-- oatcakes (a job 10, a habit day 3, a to-do 2, the first visit each day 5) and things cost more of
-- them (lib/pickle/catalogue.ts). Every Pickle starts on economy 1; the app switches it to 2 the
-- next time it loads (upgradePet in lib/pet.ts), multiplying what's in the tin by five.
alter table public.pets
  add column if not exists economy smallint not null default 1,
  add column if not exists spent integer not null default 0,
  add column if not exists owned text[] not null default '{}',
  add column if not exists worn jsonb not null default '{}',
  add column if not exists games_total integer not null default 0,
  add column if not exists game_day date,
  add column if not exists game_paid integer not null default 0,
  add column if not exists bakery jsonb not null default '{}';
alter table public.business_pets
  add column if not exists economy smallint not null default 1,
  add column if not exists spent integer not null default 0,
  add column if not exists owned text[] not null default '{}',
  add column if not exists worn jsonb not null default '{}',
  add column if not exists games_total integer not null default 0,
  add column if not exists game_day date,
  add column if not exists game_paid integer not null default 0,
  add column if not exists bakery jsonb not null default '{}';

grant update (earned_base, economy, spent, owned, worn, games_total, game_day, game_paid, bakery) on public.pets, public.business_pets to authenticated;

-- The first visit each day: two oatcakes on the old economy, five on the new.
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
      bonus = bonus + case when economy >= 2 then 5 else 2 end
    where owner_email = public.my_email() and last_visit is distinct from today
    returning to_jsonb(pets.*) into pet;
    if pet is null then select to_jsonb(p.*) into pet from pets p where owner_email = public.my_email(); return pet || '{"gift":false}'; end if;
  else
    if not (p_business = any (public.my_businesses())) then return null; end if;
    update business_pets set last_visit = today,
      streak = case when last_visit = today - 1 then streak + 1 else 1 end,
      best_streak = greatest(best_streak, case when last_visit = today - 1 then streak + 1 else 1 end),
      bonus = bonus + case when economy >= 2 then 5 else 2 end
    where business_id = p_business and last_visit is distinct from today
    returning to_jsonb(business_pets.*) into pet;
    if pet is null then select to_jsonb(b.*) into pet from business_pets b where business_id = p_business; return pet || '{"gift":false}'; end if;
  end if;
  return pet || '{"gift":true}';
end $$;

revoke execute on function public.pet_visit(uuid) from public, anon;
grant execute on function public.pet_visit(uuid) to authenticated;
