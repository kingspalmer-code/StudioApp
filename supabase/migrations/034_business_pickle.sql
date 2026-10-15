-- Pickle for each business that sends requests: one pet shared by all of that business's logins,
-- on their Overview. The business earns an oatcake for every one of its jobs that's finished.
-- Same counters as the studio's own pets (027).
create table if not exists public.business_pets (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  earned_base integer not null default 0,
  fed integer not null default 0,
  golden integer not null default 0,
  last_fed_at timestamptz,
  last_golden_at timestamptz,
  last_visit date,
  streak integer not null default 0,
  best_streak integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.business_pets enable row level security;

-- Anyone who can request work for the business looks after its Pickle.
create policy "business pet" on public.business_pets
  for all to authenticated
  using (business_id = any (public.my_businesses()))
  with check (business_id = any (public.my_businesses()));
