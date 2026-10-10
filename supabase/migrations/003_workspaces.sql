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
