-- Studio Desk database schema.
-- Run this once in Supabase: SQL Editor > New query > paste > Run.

-- Businesses -----------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  color text not null default '#007aff'
);

insert into public.businesses (slug, name, color) values
  ('brewery-tap', 'The Brewery Tap', '#ff9500'),
  ('hoprocket', 'HopRocket', '#34c759'),
  ('boomtowers', 'Boomtowers', '#af52de'),
  ('motherchip', 'Motherchip', '#ff2d55'),
  ('queens-brewery', 'Queens Brewery', '#5856d6')
on conflict (slug) do nothing;

-- Members: who can sign in, and what they see ---------------------------------
-- role 'designer' = Kingsley (everything), 'manager' = read-only overview,
-- 'client' = staff at one business (only that business's requests).
create table if not exists public.members (
  email text primary key check (email = lower(email)),
  full_name text not null default '',
  role text not null check (role in ('designer', 'manager', 'client')),
  business_id uuid references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((role = 'client') = (business_id is not null))
);

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where email = public.my_email()
$$;

create or replace function public.my_business() returns uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.members where email = public.my_email()
$$;

-- Lets the sign-in page refuse emails that haven't been given access.
create or replace function public.is_member(check_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = lower(trim(check_email)))
$$;
grant execute on function public.is_member(text) to anon, authenticated;

-- Tickets ---------------------------------------------------------------------
create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by text not null default public.my_email(),
  requester_name text not null default '',
  title text not null,
  type text not null,
  formats text not null default '',
  brief text not null default '',
  copy text not null default '',
  links text not null default '',
  colours text not null default '',
  deadline date not null,
  event_date date,
  priority text not null default 'Standard' check (priority in ('Standard', 'High', 'Urgent')),
  approver text not null default '',
  status text not null default 'new' check (status in ('new', 'progress', 'review', 'waiting', 'done')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists tickets_business_idx on public.tickets (business_id);
create index if not exists tickets_status_idx on public.tickets (status);

create or replace function public.touch_ticket() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'done' and old.status <> 'done' then new.delivered_at = now(); end if;
  if new.status <> 'done' then new.delivered_at = null; end if;
  return new;
end $$;

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_ticket();

create table if not exists public.ticket_files (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  path text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_notes (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  author_email text not null default public.my_email(),
  author_name text not null default '',
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

-- Row-level security ----------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_files enable row level security;
alter table public.ticket_notes enable row level security;

drop policy if exists "members read businesses" on public.businesses;
create policy "members read businesses" on public.businesses
  for select to authenticated using (public.my_role() is not null);

drop policy if exists "read own member row" on public.members;
create policy "read own member row" on public.members
  for select to authenticated using (email = public.my_email() or public.my_role() in ('designer', 'manager'));

drop policy if exists "designer manages members" on public.members;
create policy "designer manages members" on public.members
  for all to authenticated using (public.my_role() = 'designer') with check (public.my_role() = 'designer');

drop policy if exists "see tickets" on public.tickets;
create policy "see tickets" on public.tickets
  for select to authenticated using (
    public.my_role() in ('designer', 'manager')
    or (public.my_role() = 'client' and business_id = public.my_business())
  );

drop policy if exists "submit tickets" on public.tickets;
create policy "submit tickets" on public.tickets
  for insert to authenticated with check (
    public.my_role() = 'designer'
    or (public.my_role() = 'client' and business_id = public.my_business()
        and status = 'new' and pinned = false and created_by = public.my_email())
  );

drop policy if exists "designer updates tickets" on public.tickets;
create policy "designer updates tickets" on public.tickets
  for update to authenticated using (public.my_role() = 'designer') with check (public.my_role() = 'designer');

drop policy if exists "designer deletes tickets" on public.tickets;
create policy "designer deletes tickets" on public.tickets
  for delete to authenticated using (public.my_role() = 'designer');

-- Files and notes follow the ticket they belong to (the subquery is itself
-- filtered by the tickets policy above).
drop policy if exists "see files" on public.ticket_files;
create policy "see files" on public.ticket_files
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));

drop policy if exists "add files" on public.ticket_files;
create policy "add files" on public.ticket_files
  for insert to authenticated with check (
    public.my_role() in ('designer', 'client')
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

drop policy if exists "see notes" on public.ticket_notes;
create policy "see notes" on public.ticket_notes
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));

drop policy if exists "add notes" on public.ticket_notes;
create policy "add notes" on public.ticket_notes
  for insert to authenticated with check (
    public.my_role() in ('designer', 'client')
    and author_email = public.my_email()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

-- File storage: private bucket, files stored under <business_id>/<ticket_id>/ --
insert into storage.buckets (id, name, public, file_size_limit)
values ('inspiration', 'inspiration', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "read inspiration" on storage.objects;
create policy "read inspiration" on storage.objects
  for select to authenticated using (
    bucket_id = 'inspiration' and (
      public.my_role() in ('designer', 'manager')
      or (storage.foldername(name))[1] = public.my_business()::text
    )
  );

drop policy if exists "upload inspiration" on storage.objects;
create policy "upload inspiration" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'inspiration' and (
      public.my_role() = 'designer'
      or (public.my_role() = 'client' and (storage.foldername(name))[1] = public.my_business()::text)
    )
  );

-- First member: change this to your own email, then run it.
-- insert into public.members (email, full_name, role) values ('you@example.com', 'Kingsley', 'designer');
