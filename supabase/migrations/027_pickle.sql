-- Pickle, the pixel pet above the queue (components/QueueWidgets.tsx). One per designer.
-- Oatcakes are earned by delivering jobs: the tin holds delivered jobs since Pickle was born
-- (plus a few to start) minus what's been fed. Pickle never dies; it only gets hungry.

create table if not exists public.pets (
  owner_email text primary key default public.my_email(),
  -- Delivered jobs already counted when Pickle was born, less the starter oatcakes.
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

alter table public.pets enable row level security;

create policy "own pet" on public.pets
  for all to authenticated
  using (owner_email = public.my_email() and public.my_role() = 'designer')
  with check (owner_email = public.my_email() and public.my_role() = 'designer');
