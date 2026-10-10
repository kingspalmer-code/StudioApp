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
