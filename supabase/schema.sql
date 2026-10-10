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

-- Personal to-dos (also in supabase/migrations/002_personal.sql) ------------

create table if not exists public.personal_projects (
  id bigint generated always as identity primary key,
  owner_email text not null default public.my_email(),
  name text not null check (length(trim(name)) > 0),
  color text not null default '#382a25',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_tasks (
  id bigint generated always as identity primary key,
  owner_email text not null default public.my_email(),
  project_id bigint references public.personal_projects (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  due date,
  flagged boolean not null default false,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists personal_tasks_owner_idx on public.personal_tasks (owner_email, done, due);

create or replace function public.touch_personal_task() returns trigger
language plpgsql as $$
begin
  if new.done and not old.done then new.done_at = now(); end if;
  if not new.done then new.done_at = null; end if;
  return new;
end $$;

drop trigger if exists personal_tasks_touch on public.personal_tasks;
create trigger personal_tasks_touch before update on public.personal_tasks
  for each row execute function public.touch_personal_task();

alter table public.personal_projects enable row level security;
alter table public.personal_tasks enable row level security;

drop policy if exists "own projects" on public.personal_projects;
create policy "own projects" on public.personal_projects
  for all to authenticated
  using (owner_email = public.my_email() and public.my_role() = 'designer')
  with check (owner_email = public.my_email() and public.my_role() = 'designer');

drop policy if exists "own tasks" on public.personal_tasks;
create policy "own tasks" on public.personal_tasks
  for all to authenticated
  using (owner_email = public.my_email() and public.my_role() = 'designer')
  with check (
    owner_email = public.my_email() and public.my_role() = 'designer'
    and (project_id is null or exists (select 1 from public.personal_projects p where p.id = project_id))
  );

-- ============================================================================
-- Workspaces (migration 003)
-- ============================================================================
-- Workspaces: each person or business using Oatcake gets a private workspace with its own
-- customers, stages and job types. Existing data moves into the first workspace untouched.
-- Written without DROP statements so it can be applied in one go; policies are altered in place.

-- Workspaces ------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'studio' check (kind in ('studio', 'trade')),
  owner_name text not null default '',
  created_at timestamptz not null default now()
);

-- People who can set up new workspaces (invite-only for now).
create table if not exists public.platform_admins (email text primary key check (email = lower(email)));

-- Job stages, in order. The last stage is the "finished" one.
create table if not exists public.stages (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  color text not null default 'blue',
  position int not null default 0,
  unique (workspace_id, key)
);

-- Kinds of job and how many working days each needs (drives the start-by priority).
create table if not exists public.job_types (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  lead_days int not null default 3 check (lead_days between 0 and 365),
  position int not null default 0,
  unique (workspace_id, name)
);

-- Default stages and job types for a new workspace.
create or replace function public.seed_workspace(ws uuid, ws_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if ws_kind = 'trade' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'quote', 'Quote sent', 'orange', 0),
      (ws, 'paid', 'Quote paid', 'teal', 1),
      (ws, 'design', 'Design', 'blue', 2),
      (ws, 'build', 'Building', 'purple', 3),
      (ws, 'done', 'Finished', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Shop fascia', 10, 0), (ws, 'Van livery', 5, 1), (ws, 'Hand lettering', 3, 2),
      (ws, 'A-board', 3, 3), (ws, 'Window vinyl', 2, 4), (ws, 'Other', 3, 5);
  else
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'new', 'New', 'blue', 0),
      (ws, 'progress', 'In progress', 'indigo', 1),
      (ws, 'review', 'With client', 'purple', 2),
      (ws, 'waiting', 'Waiting on client', 'orange', 3),
      (ws, 'done', 'Delivered', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Poster', 5, 0), (ws, 'Social media', 2, 1), (ws, 'Menu', 5, 2), (ws, 'Merch', 10, 3),
      (ws, 'Website', 12, 4), (ws, 'Photoshoot', 4, 5), (ws, 'Other', 3, 6);
  end if;
end $$;
revoke execute on function public.seed_workspace(uuid, text) from public, anon, authenticated;

-- Move existing data into the first workspace -----------------------------------
alter table public.members add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.businesses add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.tickets add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

do $$
declare ws uuid;
begin
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name, kind, owner_name) values ('Kingsley''s Studio', 'studio', 'Kingsley') returning id into ws;
    perform public.seed_workspace(ws, 'studio');
    update public.members set workspace_id = ws where workspace_id is null;
    update public.businesses set workspace_id = ws where workspace_id is null;
    update public.tickets set workspace_id = ws where workspace_id is null;
    insert into public.platform_admins (email) values ('kingspalmer@gmail.com') on conflict do nothing;
  end if;
end $$;

create or replace function public.my_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.members where email = public.my_email()
$$;

alter table public.members alter column workspace_id set not null;
alter table public.members alter column workspace_id set default public.my_workspace();
alter table public.businesses alter column workspace_id set not null;
alter table public.businesses alter column workspace_id set default public.my_workspace();
alter table public.tickets alter column workspace_id set not null;
create index if not exists members_workspace_idx on public.members (workspace_id);
create index if not exists businesses_workspace_idx on public.businesses (workspace_id);
create index if not exists tickets_workspace_idx on public.tickets (workspace_id);

-- Customers: slugs are unique per workspace, plus contact details for trades.
alter table public.businesses drop constraint if exists businesses_slug_key;
alter table public.businesses add constraint businesses_workspace_slug_key unique (workspace_id, slug);
alter table public.businesses add column if not exists phone text not null default '';
alter table public.businesses add column if not exists email text not null default '';
alter table public.businesses add column if not exists address text not null default '';
alter table public.businesses add column if not exists notes text not null default '';

-- Jobs: stages are per workspace now, plus quote and site fields for trades.
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add column if not exists quote_amount numeric(10, 2);
alter table public.tickets add column if not exists paid_amount numeric(10, 2);
alter table public.tickets add column if not exists site_address text not null default '';

-- A member's business must be in their own workspace.
create or replace function public.check_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.business_id is not null and not exists (
    select 1 from businesses b where b.id = new.business_id and b.workspace_id = new.workspace_id
  ) then
    raise exception 'That business is not in this workspace';
  end if;
  return new;
end $$;
create or replace trigger members_check before insert or update on public.members
  for each row execute function public.check_member();

-- A job takes its workspace from its customer, and its stage must exist in that workspace.
-- On insert an unknown stage falls back to the first stage.
create or replace function public.check_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_key text;
begin
  select workspace_id into new.workspace_id from businesses where id = new.business_id;
  if not exists (select 1 from stages s where s.workspace_id = new.workspace_id and s.key = new.status) then
    if tg_op = 'INSERT' then
      select key into first_key from stages where workspace_id = new.workspace_id order by position, id limit 1;
      new.status = coalesce(first_key, new.status);
    else
      raise exception 'Unknown stage %', new.status;
    end if;
  end if;
  return new;
end $$;
create or replace trigger tickets_check before insert or update on public.tickets
  for each row execute function public.check_ticket();

-- Keep delivered_at in step with the workspace's last stage.
create or replace function public.final_stage(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select key from stages where workspace_id = ws order by position desc, id desc limit 1
$$;
create or replace function public.first_stage(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select key from stages where workspace_id = ws order by position, id limit 1
$$;

create or replace function public.touch_ticket() returns trigger
language plpgsql as $$
declare fin text := public.final_stage(new.workspace_id);
begin
  new.updated_at = now();
  if new.status = fin and old.status is distinct from fin then new.delivered_at = now(); end if;
  if new.status <> fin then new.delivered_at = null; end if;
  return new;
end $$;

-- Creates a workspace with its first owner. Only platform admins can call it.
create or replace function public.create_workspace(ws_name text, owner_email text, owner_name text, ws_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid; e text := lower(trim(owner_email));
begin
  if not exists (select 1 from platform_admins where email = public.my_email()) then
    raise exception 'Only Oatcake admins can create workspaces';
  end if;
  if ws_kind not in ('studio', 'trade') then raise exception 'Unknown workspace kind'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if exists (select 1 from members where email = e) then raise exception 'That email already has an Oatcake account'; end if;
  insert into workspaces (name, kind, owner_name) values (trim(ws_name), ws_kind, trim(coalesce(owner_name, ''))) returning id into ws;
  perform seed_workspace(ws, ws_kind);
  insert into members (email, full_name, role, workspace_id) values (e, trim(coalesce(owner_name, '')), 'designer', ws);
  return ws;
end $$;
revoke execute on function public.create_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text) to authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where email = public.my_email())
$$;

-- Row-level security ------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.platform_admins enable row level security;
alter table public.stages enable row level security;
alter table public.job_types enable row level security;

create policy "see own workspace" on public.workspaces
  for select to authenticated using (id = public.my_workspace() or public.is_platform_admin());
create policy "owner renames workspace" on public.workspaces
  for update to authenticated using (id = public.my_workspace() and public.my_role() = 'designer')
  with check (id = public.my_workspace() and public.my_role() = 'designer');

create policy "admins see admins" on public.platform_admins
  for select to authenticated using (public.is_platform_admin());

create policy "see stages" on public.stages
  for select to authenticated using (workspace_id = public.my_workspace());
create policy "owner manages stages" on public.stages
  for all to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'designer');

create policy "see job types" on public.job_types
  for select to authenticated using (workspace_id = public.my_workspace());
create policy "owner manages job types" on public.job_types
  for all to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'designer');

alter policy "members read businesses" on public.businesses
  using (workspace_id = public.my_workspace());
create policy "owner manages businesses" on public.businesses
  for all to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'designer');

alter policy "read own member row" on public.members
  using (email = public.my_email() or (workspace_id = public.my_workspace() and public.my_role() in ('designer', 'manager')));
alter policy "designer manages members" on public.members
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'designer');

alter policy "see tickets" on public.tickets
  using (
    workspace_id = public.my_workspace() and (
      public.my_role() in ('designer', 'manager')
      or (public.my_role() = 'client' and business_id = public.my_business())
    )
  );
alter policy "submit tickets" on public.tickets
  with check (
    workspace_id = public.my_workspace() and (
      public.my_role() = 'designer'
      or (public.my_role() = 'client' and business_id = public.my_business()
          and status = public.first_stage(workspace_id) and pinned = false and created_by = public.my_email())
    )
  );
alter policy "designer updates tickets" on public.tickets
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'designer');
alter policy "designer deletes tickets" on public.tickets
  using (workspace_id = public.my_workspace() and public.my_role() = 'designer');

-- Files live under <business_id>/<ticket_id>/; a folder is visible if its business is.
alter policy "read inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and (
      (public.my_role() in ('designer', 'manager')
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (storage.foldername(name))[1] = public.my_business()::text
    )
  );
alter policy "upload inspiration" on storage.objects
  with check (
    bucket_id = 'inspiration' and (
      (public.my_role() = 'designer'
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (public.my_role() = 'client' and (storage.foldername(name))[1] = public.my_business()::text)
    )
  );
create policy "designer removes inspiration" on storage.objects
  for delete to authenticated using (
    bucket_id = 'inspiration' and public.my_role() = 'designer'
    and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1])
  );

-- Oatcake admins can look inside any workspace, read-only. The app sends the workspace to view
-- in an x-oatcake-workspace request header; it only counts for platform admins. Reads follow
-- view_workspace(); every write follows edit_workspace(), which is empty while viewing someone
-- else's workspace, so nothing can be changed there. No DROP statements, policies altered in place.

create or replace function public.view_workspace() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
  w uuid;
begin
  if public.is_platform_admin() then
    v := nullif(current_setting('request.headers', true), '')::json ->> 'x-oatcake-workspace';
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into w from workspaces where id = v::uuid;
      if w is not null then
        return w;
      end if;
    end if;
  end if;
  return public.my_workspace();
end $$;

create or replace function public.edit_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select case when public.view_workspace() = public.my_workspace() then public.my_workspace() end
$$;

grant execute on function public.view_workspace() to authenticated;
grant execute on function public.edit_workspace() to authenticated;

-- Reads
alter policy "see stages" on public.stages using (workspace_id = public.view_workspace());
alter policy "see job types" on public.job_types using (workspace_id = public.view_workspace());
alter policy "members read businesses" on public.businesses using (workspace_id = public.view_workspace());
alter policy "read own member row" on public.members
  using (email = public.my_email() or (workspace_id = public.view_workspace() and public.my_role() in ('designer', 'manager')));
alter policy "see tickets" on public.tickets
  using (
    workspace_id = public.view_workspace() and (
      public.my_role() in ('designer', 'manager')
      or (public.my_role() = 'client' and business_id = public.my_business())
    )
  );
alter policy "read inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and (
      public.is_platform_admin()
      or (public.my_role() in ('designer', 'manager')
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (storage.foldername(name))[1] = public.my_business()::text
    )
  );

-- Writes (the "manages" policies cover select too, so they must not leak the owner's own rows while viewing)
alter policy "owner manages stages" on public.stages
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner manages job types" on public.job_types
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner manages businesses" on public.businesses
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "designer manages members" on public.members
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner renames workspace" on public.workspaces
  using (id = public.edit_workspace() and public.my_role() = 'designer')
  with check (id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "submit tickets" on public.tickets
  with check (
    workspace_id = public.edit_workspace() and (
      public.my_role() = 'designer'
      or (public.my_role() = 'client' and business_id = public.my_business()
          and status = public.first_stage(workspace_id) and pinned = false and created_by = public.my_email())
    )
  );
alter policy "designer updates tickets" on public.tickets
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "designer deletes tickets" on public.tickets
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "add files" on public.ticket_files
  with check (
    public.my_role() in ('designer', 'client')
    and exists (select 1 from public.tickets t where t.id = ticket_files.ticket_id and t.workspace_id = public.edit_workspace())
  );
alter policy "add notes" on public.ticket_notes
  with check (
    public.my_role() in ('designer', 'client') and author_email = public.my_email()
    and exists (select 1 from public.tickets t where t.id = ticket_notes.ticket_id and t.workspace_id = public.edit_workspace())
  );
alter policy "upload inspiration" on storage.objects
  with check (
    bucket_id = 'inspiration' and (
      (public.my_role() = 'designer'
        and exists (select 1 from public.businesses b
          where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
      or (public.my_role() = 'client' and (storage.foldername(name))[1] = public.my_business()::text)
    )
  );
alter policy "designer removes inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and public.my_role() = 'designer'
    and exists (select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace())
  );

-- Job form: each workspace decides what a new job asks for. Built-in fields map to ticket
-- columns (they can be renamed, hidden, reordered and made required, but not deleted);
-- added fields keep their values in tickets.details. Hiding a field never removes saved values.
-- Starter profiles: a new workspace starts from one of six setups (stages, job types, form).
-- Policies are created fresh on the new table; nothing existing is removed.

alter table public.tickets add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.workspaces add column if not exists profile text not null default 'creative';

create table if not exists public.job_fields (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  kind text not null check (kind in ('heading', 'text', 'longtext', 'number', 'money', 'date', 'select',
                                     'checkbox', 'link', 'address', 'phone', 'email', 'files')),
  hint text not null default '',
  options text[] not null default '{}',
  required boolean not null default false,
  hidden boolean not null default false,
  on_form boolean not null default true,      -- false: only filled in on the job page
  type_ids bigint[] not null default '{}',     -- empty: every job type
  builtin boolean not null default false,
  position int not null default 0,
  unique (workspace_id, key)
);

create or replace function public.builtin_field_keys() returns text[]
language sql immutable as $$
  select array['formats', 'brief', 'copy', 'links', 'colours', 'event_date', 'requester_name', 'approver',
               'site_address', 'quote_amount', 'paid_amount', 'files']
$$;

-- Built-in fields keep their key and type. People can't add fields under built-in names; seeding can.
create or replace function public.guard_job_field() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.key := old.key;
    new.builtin := old.builtin;
    if old.builtin or old.kind = 'heading' then new.kind := old.kind; end if;
  elsif current_user in ('authenticated', 'anon') and new.key = any (public.builtin_field_keys()) then
    raise exception 'That field name is reserved';
  end if;
  if new.kind = 'files' and not new.builtin then raise exception 'Only the built-in files field can take uploads'; end if;
  return new;
end $$;
create or replace trigger guard_job_field before insert or update on public.job_fields
  for each row execute function public.guard_job_field();

alter table public.job_fields enable row level security;
create policy "see job fields" on public.job_fields
  for select to authenticated using (workspace_id = public.view_workspace());
create policy "owner adds job fields" on public.job_fields
  for insert to authenticated
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer' and not builtin);
create policy "owner edits job fields" on public.job_fields
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner removes job fields" on public.job_fields
  for delete to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer' and not builtin);

-- Seeding ------------------------------------------------------------------------
create or replace function public.add_job_field(ws uuid, f_key text, f_label text, f_kind text,
  f_hint text default '', f_required boolean default false, f_on_form boolean default true,
  f_options text[] default '{}', f_hidden boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into job_fields (workspace_id, key, label, kind, hint, required, on_form, options, hidden, builtin, position)
  values (ws, f_key, f_label, f_kind, f_hint, f_required, f_on_form, f_options, f_hidden,
          f_key = any (builtin_field_keys()),
          coalesce((select max(position) + 1 from job_fields where workspace_id = ws), 0))
  on conflict (workspace_id, key) do nothing;
end $$;

create or replace function public.seed_fields(ws uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p = 'trades' then
    perform add_job_field(ws, 'formats', 'Size / measurements', 'text', '2400 × 600mm, double-sided');
    perform add_job_field(ws, 'brief', 'Job notes', 'longtext', 'Wording, colours, materials, fixings');
    perform add_job_field(ws, 'site_address', 'Site address', 'address', 'Where the job is');
    perform add_job_field(ws, 'quote_amount', 'Quote (£)', 'money', 'Leave blank if not quoted yet');
    perform add_job_field(ws, 'paid_amount', 'Paid (£)', 'money', '', false, false);
    perform add_job_field(ws, 'files', 'Photos / drawings', 'files');
  elsif p = 'photo' then
    perform add_job_field(ws, 'event_date', 'Shoot date', 'date');
    perform add_job_field(ws, 'site_address', 'Location', 'address', 'Where the shoot is');
    perform add_job_field(ws, 'brief', 'Brief', 'longtext', 'What it''s for, the look and feel');
    perform add_job_field(ws, 'copy', 'Shot list', 'longtext', 'Must-have shots, people, products');
    perform add_job_field(ws, 'formats', 'Deliverables', 'text', 'e.g. 40 edited images, 60-second reel');
    perform add_job_field(ws, 'quote_amount', 'Fee (£)', 'money');
    perform add_job_field(ws, 'paid_amount', 'Deposit paid (£)', 'money', '', false, false);
    perform add_job_field(ws, 'files', 'Reference images', 'files');
  elsif p = 'events' then
    perform add_job_field(ws, 'event_date', 'Event date', 'date', '', true);
    perform add_job_field(ws, 'site_address', 'Venue', 'address');
    perform add_job_field(ws, 'brief', 'Plan', 'longtext', 'What''s happening and who it''s for');
    perform add_job_field(ws, 'suppliers', 'Suppliers', 'longtext', 'Bands, DJs, caterers, hire');
    perform add_job_field(ws, 'quote_amount', 'Budget (£)', 'money');
    perform add_job_field(ws, 'artwork', 'Artwork needed', 'checkbox');
    perform add_job_field(ws, 'files', 'Files', 'files');
  elsif p = 'content' then
    perform add_job_field(ws, 'channel', 'Channel', 'select', '', false, true,
      array['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Email', 'Website']);
    perform add_job_field(ws, 'event_date', 'Publish date', 'date');
    perform add_job_field(ws, 'brief', 'Idea', 'longtext', 'The angle and the hook');
    perform add_job_field(ws, 'copy', 'Copy', 'longtext', 'Caption or text as it should go out');
    perform add_job_field(ws, 'links', 'Links', 'link');
    perform add_job_field(ws, 'files', 'Assets', 'files');
    perform add_job_field(ws, 'approver', 'Approver', 'text', 'Who signs it off');
  elsif p = 'personal' then
    perform add_job_field(ws, 'brief', 'Notes', 'longtext');
    perform add_job_field(ws, 'links', 'Links', 'link');
    perform add_job_field(ws, 'files', 'Files', 'files');
  else -- creative
    perform add_job_field(ws, 'formats', 'Sizes / formats', 'text', 'A3 print, IG post 1080×1350, story');
    perform add_job_field(ws, 'brief', 'What do you need?', 'longtext', 'Goal, audience, where it will be used', true);
    perform add_job_field(ws, 'h_copy', 'Copy', 'heading');
    perform add_job_field(ws, 'copy', 'Exact wording to use', 'longtext',
      'Headline, dates, prices, small print. Paste it exactly as it should appear.');
    perform add_job_field(ws, 'h_inspiration', 'Inspiration', 'heading');
    perform add_job_field(ws, 'links', 'Links', 'link', 'Pinterest, Instagram, websites');
    perform add_job_field(ws, 'files', 'Images / logos', 'files');
    perform add_job_field(ws, 'colours', 'Colours / mood', 'text', 'Autumnal, gold and black, playful');
    perform add_job_field(ws, 'event_date', 'Event / go-live', 'date');
    perform add_job_field(ws, 'h_signoff', 'Sign-off', 'heading');
    perform add_job_field(ws, 'requester_name', 'Requested by', 'text', 'Who should we ask?', true);
    perform add_job_field(ws, 'approver', 'Final approver', 'text', 'If someone else signs it off');
  end if;
  -- Every other built-in field is there too, switched off, ready to turn on.
  perform add_job_field(ws, 'formats', 'Sizes / formats', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'brief', 'Notes', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'copy', 'Exact wording', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'links', 'Links', 'link', '', false, true, '{}', true);
  perform add_job_field(ws, 'colours', 'Colours / mood', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'event_date', 'Event date', 'date', '', false, true, '{}', true);
  perform add_job_field(ws, 'site_address', 'Address', 'address', '', false, true, '{}', true);
  perform add_job_field(ws, 'quote_amount', 'Quote (£)', 'money', '', false, true, '{}', true);
  perform add_job_field(ws, 'paid_amount', 'Paid (£)', 'money', '', false, false, '{}', true);
  perform add_job_field(ws, 'files', 'Files', 'files', '', false, true, '{}', true);
  perform add_job_field(ws, 'requester_name', 'Requested by', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'approver', 'Approver', 'text', '', false, true, '{}', true);
end $$;

create or replace function public.seed_profile(ws uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p = 'trades' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'quote', 'Quote sent', 'orange', 0), (ws, 'paid', 'Quote paid', 'teal', 1), (ws, 'design', 'Design', 'blue', 2),
      (ws, 'build', 'Building', 'purple', 3), (ws, 'done', 'Finished', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Shop fascia', 10, 0), (ws, 'Van livery', 5, 1), (ws, 'Hand lettering', 3, 2),
      (ws, 'A-board', 3, 3), (ws, 'Window vinyl', 2, 4), (ws, 'Other', 3, 5);
  elsif p = 'photo' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'enquiry', 'Enquiry', 'blue', 0), (ws, 'booked', 'Booked', 'indigo', 1), (ws, 'shoot', 'Shoot', 'purple', 2),
      (ws, 'editing', 'Editing', 'orange', 3), (ws, 'delivered', 'Delivered', 'teal', 4), (ws, 'done', 'Paid', 'green', 5);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Portrait', 5, 0), (ws, 'Event', 7, 1), (ws, 'Product', 5, 2), (ws, 'Wedding', 20, 3),
      (ws, 'Video', 10, 4), (ws, 'Other', 5, 5);
  elsif p = 'events' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'idea', 'Idea', 'blue', 0), (ws, 'planning', 'Planning', 'indigo', 1), (ws, 'promoting', 'Promoting', 'purple', 2),
      (ws, 'eventday', 'Event day', 'orange', 3), (ws, 'done', 'Wrapped up', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Live music', 14, 0), (ws, 'Quiz or theme night', 7, 1), (ws, 'Private hire', 10, 2),
      (ws, 'Festival', 30, 3), (ws, 'Other', 7, 4);
  elsif p = 'content' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'ideas', 'Ideas', 'blue', 0), (ws, 'drafting', 'Drafting', 'indigo', 1), (ws, 'review', 'In review', 'purple', 2),
      (ws, 'scheduled', 'Scheduled', 'orange', 3), (ws, 'done', 'Published', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Social post', 2, 0), (ws, 'Reel or video', 4, 1), (ws, 'Blog or article', 5, 2),
      (ws, 'Newsletter', 3, 3), (ws, 'Campaign', 10, 4), (ws, 'Other', 3, 5);
  elsif p = 'personal' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'todo', 'To do', 'blue', 0), (ws, 'doing', 'Doing', 'orange', 1), (ws, 'done', 'Done', 'green', 2);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Task', 1, 0), (ws, 'Project', 5, 1), (ws, 'Errand', 1, 2);
  else -- creative
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'new', 'New', 'blue', 0), (ws, 'progress', 'In progress', 'indigo', 1), (ws, 'review', 'With client', 'purple', 2),
      (ws, 'waiting', 'Waiting on client', 'orange', 3), (ws, 'done', 'Delivered', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Poster', 5, 0), (ws, 'Social media', 2, 1), (ws, 'Menu', 5, 2), (ws, 'Merch', 10, 3),
      (ws, 'Website', 12, 4), (ws, 'Photoshoot', 4, 5), (ws, 'Other', 3, 6);
  end if;
  perform seed_fields(ws, p);
end $$;

-- Admin-created workspaces use the matching profile.
create or replace function public.seed_workspace(ws uuid, ws_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare p text := case when ws_kind = 'trade' then 'trades' else 'creative' end;
begin
  update workspaces set profile = p where id = ws;
  perform seed_profile(ws, p);
end $$;

revoke execute on function public.add_job_field(uuid, text, text, text, text, boolean, boolean, text[], boolean) from public, anon, authenticated;
revoke execute on function public.seed_fields(uuid, text) from public, anon, authenticated;
revoke execute on function public.seed_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.seed_workspace(uuid, text) from public, anon, authenticated;

-- Existing workspaces get the form that matches what they have today.
update public.workspaces set profile = case when kind = 'trade' then 'trades' else 'creative' end;
do $$
declare w record;
begin
  for w in select id, profile from public.workspaces where not exists (select 1 from public.job_fields f where f.workspace_id = workspaces.id) loop
    perform public.seed_fields(w.id, w.profile);
  end loop;
end $$;

-- Self sign-up ------------------------------------------------------------------
-- Anyone signed in without a workspace can start one. Clients logging in means a studio-style
-- workspace (requests from businesses); otherwise it's just them (jobs for customers).
create or replace function public.start_workspace(ws_name text, owner_name text, ws_profile text, clients_log_in boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid; e text := public.my_email();
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if ws_profile not in ('creative', 'photo', 'trades', 'events', 'content', 'personal') then raise exception 'Pick what you do'; end if;
  if length(trim(coalesce(ws_name, ''))) = 0 then raise exception 'Give your workspace a name'; end if;
  insert into workspaces (name, kind, owner_name, profile)
  values (left(trim(ws_name), 80), case when clients_log_in then 'studio' else 'trade' end,
          left(trim(coalesce(owner_name, '')), 80), ws_profile)
  returning id into ws;
  perform seed_profile(ws, ws_profile);
  insert into members (email, full_name, role, workspace_id) values (e, left(trim(coalesce(owner_name, '')), 80), 'designer', ws);
  return ws;
end $$;
revoke execute on function public.start_workspace(text, text, text, boolean) from public, anon;
grant execute on function public.start_workspace(text, text, text, boolean) to authenticated;

-- Lets the workspace owner see which of their people have signed in yet, so the People page
-- can offer to send an invite to those who haven't.
create or replace function public.members_signed_in() returns setof text
language sql stable security definer set search_path = public, auth as $$
  select m.email from public.members m
  join auth.users u on lower(u.email) = m.email
  where m.workspace_id = public.edit_workspace() and public.my_role() = 'designer' and u.last_sign_in_at is not null
$$;
grant execute on function public.members_signed_in() to authenticated;
-- Sign-up setup helper: someone describes their work, Claude suggests stages, job types and a job
-- form, they adjust it, and start_custom_workspace() saves it. Each suggestion is counted so one
-- person gets a few tries a day and Oatcake as a whole has a daily cap on what it spends.

create table if not exists public.setup_tries (
  id bigint generated always as identity primary key,
  email text not null,
  at timestamptz not null default now()
);
create index if not exists setup_tries_at_idx on public.setup_tries (at);
alter table public.setup_tries enable row level security;
-- No policies: only the functions below read or write it.

create or replace function public.note_setup_try() returns void
language plpgsql security definer set search_path = public as $$
declare e text := public.my_email();
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if (select count(*) from setup_tries where email = e and at > now() - interval '1 day') >= 5 then
    raise exception 'That''s the most tries for today. Start with a blank workspace instead.';
  end if;
  if (select count(*) from setup_tries where at > now() - interval '1 day') >= 300 then
    raise exception 'The setup helper is busy today. Start with a blank workspace instead.';
  end if;
  insert into setup_tries (email) values (e);
end $$;
revoke execute on function public.note_setup_try() from public, anon;
grant execute on function public.note_setup_try() to authenticated;

create or replace function public.setup_slug(t text) returns text
language sql immutable as $$
  select coalesce(nullif(left(trim(both '_' from regexp_replace(lower(t), '[^a-z0-9]+', '_', 'g')), 30), ''), 'x')
$$;

create or replace function public.start_custom_workspace(ws_name text, owner_name text, clients_log_in boolean, setup jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  e text := public.my_email();
  base text := coalesce(setup ->> 'base', 'personal');
  item jsonb;
  n int;
  k text;
  lbl text;
  f_use text;
  f_kind text;
  f_options text[];
  builtin_kinds jsonb := '{"formats":"text","brief":"longtext","copy":"longtext","links":"link","colours":"text",
    "event_date":"date","requester_name":"text","approver":"text","site_address":"address","quote_amount":"money",
    "paid_amount":"money","files":"files"}';
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if length(trim(coalesce(ws_name, ''))) = 0 then raise exception 'Give your workspace a name'; end if;
  if jsonb_typeof(setup -> 'stages') <> 'array' or jsonb_array_length(setup -> 'stages') not between 2 and 8 then
    raise exception 'A workspace needs between 2 and 8 stages';
  end if;
  if jsonb_typeof(setup -> 'job_types') <> 'array' or jsonb_array_length(setup -> 'job_types') not between 1 and 12 then
    raise exception 'A workspace needs between 1 and 12 job types';
  end if;
  if base not in ('creative', 'photo', 'trades', 'events', 'content', 'personal') then base := 'personal'; end if;

  insert into workspaces (name, kind, owner_name, profile)
  values (left(trim(ws_name), 80), case when clients_log_in then 'studio' else 'trade' end,
          left(trim(coalesce(owner_name, '')), 80), base)
  returning id into ws;

  n := 0;
  for item in select * from jsonb_array_elements(setup -> 'stages') loop
    lbl := left(trim(coalesce(item ->> 'label', '')), 40);
    continue when lbl = '';
    k := setup_slug(lbl);
    if exists (select 1 from stages where workspace_id = ws and key = k) then k := k || '_' || n; end if;
    insert into stages (workspace_id, key, label, color, position)
    values (ws, k, lbl,
            case when item ->> 'color' in ('blue', 'indigo', 'purple', 'teal', 'orange', 'pink', 'red', 'green') then item ->> 'color' else 'blue' end,
            n);
    n := n + 1;
  end loop;
  if n < 2 then raise exception 'A workspace needs at least 2 stages'; end if;

  n := 0;
  for item in select * from jsonb_array_elements(setup -> 'job_types') loop
    lbl := left(trim(coalesce(item ->> 'name', '')), 50);
    continue when lbl = '';
    insert into job_types (workspace_id, name, lead_days, position)
    values (ws, lbl, least(365, greatest(0, coalesce((item ->> 'lead_days')::numeric, 3)::int)), n)
    on conflict (workspace_id, name) do nothing;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'A workspace needs at least 1 job type'; end if;

  n := 0;
  for item in select * from jsonb_array_elements(coalesce(setup -> 'fields', '[]')) limit 25 loop
    lbl := left(trim(coalesce(item ->> 'label', '')), 60);
    continue when lbl = '';
    f_use := coalesce(item ->> 'use', 'custom');
    if builtin_kinds ? f_use then
      perform add_job_field(ws, f_use, lbl, builtin_kinds ->> f_use, left(coalesce(item ->> 'hint', ''), 120),
                            coalesce((item ->> 'required')::boolean, false));
    else
      f_kind := item ->> 'kind';
      if f_kind is null or f_kind not in ('heading', 'text', 'longtext', 'number', 'money', 'date', 'select',
                                           'checkbox', 'link', 'address', 'phone', 'email') then f_kind := 'text'; end if;
      f_options := array(select left(trim(o), 40) from jsonb_array_elements_text(coalesce(item -> 'options', '[]')) o
                         where trim(o) <> '' limit 20);
      if f_kind = 'select' and coalesce(array_length(f_options, 1), 0) < 2 then f_kind := 'text'; end if;
      if f_kind <> 'select' then f_options := '{}'; end if;
      k := case when f_kind = 'heading' then 'h_' else 'f_' end || setup_slug(lbl);
      if exists (select 1 from job_fields where workspace_id = ws and key = k) then k := k || '_' || n; end if;
      perform add_job_field(ws, k, lbl, f_kind, left(coalesce(item ->> 'hint', ''), 120),
                            f_kind <> 'heading' and coalesce((item ->> 'required')::boolean, false), true, f_options);
    end if;
    n := n + 1;
  end loop;

  -- Every other built-in field is there too, switched off, ready to turn on.
  perform add_job_field(ws, 'formats', 'Sizes / formats', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'brief', 'Notes', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'copy', 'Exact wording', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'links', 'Links', 'link', '', false, true, '{}', true);
  perform add_job_field(ws, 'colours', 'Colours / mood', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'event_date', 'Event date', 'date', '', false, true, '{}', true);
  perform add_job_field(ws, 'site_address', 'Address', 'address', '', false, true, '{}', true);
  perform add_job_field(ws, 'quote_amount', 'Quote (£)', 'money', '', false, true, '{}', true);
  perform add_job_field(ws, 'paid_amount', 'Paid (£)', 'money', '', false, false, '{}', true);
  perform add_job_field(ws, 'files', 'Files', 'files', '', false, true, '{}', true);
  perform add_job_field(ws, 'requester_name', 'Requested by', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'approver', 'Approver', 'text', '', false, true, '{}', true);

  insert into members (email, full_name, role, workspace_id) values (e, left(trim(coalesce(owner_name, '')), 80), 'designer', ws);
  return ws;
end $$;
revoke execute on function public.start_custom_workspace(text, text, boolean, jsonb) from public, anon;
grant execute on function public.start_custom_workspace(text, text, boolean, jsonb) to authenticated;
-- Quotes and invoices. Each workspace sets up its look once (logo, heading font, colour, business
-- details) and then makes quotes and invoices from its jobs, as PDFs it can download or email.
-- Only the workspace owner (designer role) sees or changes any of it.

create table if not exists public.doc_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  business_name text not null default '',
  address text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  vat_registered boolean not null default false,
  vat_number text not null default '',
  vat_rate numeric(5, 2) not null default 20 check (vat_rate between 0 and 100),
  bank_details text not null default '',
  payment_days int not null default 14 check (payment_days between 0 and 365),
  quote_days int not null default 30 check (quote_days between 0 and 365),
  footer text not null default '',
  font text not null default 'helvetica',
  font_path text not null default '',
  accent text not null default '#382a25' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.doc_settings enable row level security;
create policy "owner sees document settings" on public.doc_settings
  for select to authenticated using (workspace_id = public.view_workspace() and public.my_role() = 'designer');
create policy "owner adds document settings" on public.doc_settings
  for insert to authenticated with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner edits document settings" on public.doc_settings
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');

create table if not exists public.documents (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete set null,
  kind text not null check (kind in ('quote', 'invoice')),
  number int not null default 0,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  title text not null default '',
  items jsonb not null default '[]'::jsonb,   -- [{description, qty, unit_price}]
  notes text not null default '',
  issued_on date not null default current_date,
  due_on date,
  vat_rate numeric(5, 2),                     -- null when the business isn't VAT registered
  subtotal numeric(12, 2) not null default 0,
  vat numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'paid')),
  sent_at timestamptz,
  sent_to text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, kind, number)
);
create index if not exists documents_ticket_idx on public.documents (ticket_id);

-- Numbers run per workspace and kind (Quote 1, 2, 3…); totals always come from the line items.
create or replace function public.prepare_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare sub numeric := 0; item jsonb;
begin
  if tg_op = 'INSERT' then
    select coalesce(max(number), 0) + 1 into new.number from documents where workspace_id = new.workspace_id and kind = new.kind;
  else
    new.workspace_id := old.workspace_id;
    new.kind := old.kind;
    new.number := old.number;
  end if;
  if jsonb_typeof(new.items) <> 'array' then new.items := '[]'::jsonb; end if;
  for item in select * from jsonb_array_elements(new.items) loop
    sub := sub + round(coalesce((item ->> 'qty')::numeric, 0) * coalesce((item ->> 'unit_price')::numeric, 0), 2);
  end loop;
  new.subtotal := sub;
  new.vat := case when new.vat_rate is null then 0 else round(sub * new.vat_rate / 100, 2) end;
  new.total := new.subtotal + new.vat;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger prepare_document before insert or update on public.documents
  for each row execute function public.prepare_document();

alter table public.documents enable row level security;
create policy "owner sees documents" on public.documents
  for select to authenticated using (workspace_id = public.view_workspace() and public.my_role() = 'designer');
create policy "owner adds documents" on public.documents
  for insert to authenticated with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner edits documents" on public.documents
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner removes documents" on public.documents
  for delete to authenticated using (workspace_id = public.edit_workspace() and public.my_role() = 'designer');

-- Logos and uploaded fonts, stored under <workspace_id>/ in a private bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('brand', 'brand', false, 5242880)
on conflict (id) do nothing;
create policy "see brand files" on storage.objects
  for select to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.view_workspace()::text and public.my_role() = 'designer');
create policy "add brand files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');
create policy "change brand files" on storage.objects
  for update to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');
create policy "remove brand files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');

-- AI drafting of line items: a daily allowance per workspace and across Oatcake.
create table if not exists public.ai_uses (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  what text not null,
  at timestamptz not null default now()
);
create index if not exists ai_uses_at_idx on public.ai_uses (at);
alter table public.ai_uses enable row level security;

create or replace function public.note_ai_use(what text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid := public.edit_workspace();
begin
  if ws is null or public.my_role() <> 'designer' then raise exception 'Only the workspace owner can do that'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and at > now() - interval '1 day') >= 40 then
    raise exception 'That''s the most AI drafts for today. You can still fill it in yourself.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1000 then
    raise exception 'AI drafting is busy today. You can still fill it in yourself.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, left(what, 40));
end $$;
revoke execute on function public.note_ai_use(text) from public, anon;
grant execute on function public.note_ai_use(text) to authenticated;
