-- What an employee can see and change beyond their own to-do list, set by the owner on Team.
-- Each area (jobs, clients, quotes, team, settings) is none, view or edit. An employee with
-- nothing set has none everywhere, which is how employees worked before this.
-- The owner (designer) can always do everything; can() says so, so the rules below read the same
-- for the owner as before.

alter table public.members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.members drop constraint if exists members_permissions_check;
alter table public.members add constraint members_permissions_check check (jsonb_typeof(permissions) = 'object');

-- Whether the signed-in person may look at (need 'view') or change (need 'edit') an area.
create or replace function public.can(area text, need text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.role = 'designer'
      or (m.role = 'staff' and case coalesce(m.permissions ->> area, 'none')
        when 'edit' then true
        when 'view' then need = 'view'
        else false end)
    from public.members m where m.email = public.my_email()
  ), false)
$$;
grant execute on function public.can(text, text) to authenticated;

-- Every rule that said "only the owner" now says "the owner, or an employee allowed into this
-- area": edit for changes, view for looking. Rules that let the owner and managers look let
-- employees with view in too. Each table belongs to one area.
do $$
declare
  p record;
  area text;
  r constant text := '(\( SELECT my_role\(\) AS my_role\)|my_role\(\))';
  nq text;
  nw text;
  fix text;
begin
  for p in select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' loop
    area := case
      when p.tablename in ('tickets', 'ticket_notes', 'ticket_files', 'ticket_drafts', 'ticket_draft_files', 'ticket_deliveries', 'ticket_events') then 'requests'
      when p.tablename in ('businesses', 'member_businesses', 'apps', 'app_models', 'app_backgrounds') then 'clients'
      when p.tablename in ('documents', 'doc_settings') then 'quotes'
      when p.tablename in ('stages', 'job_types', 'job_fields', 'workspaces') then 'settings'
      when p.tablename in ('staff_tasks', 'staff_task_notes', 'staff_task_ticks') then 'team'
    end;
    continue when area is null;
    nq := p.qual;
    nw := p.with_check;
    for i in 1..2 loop
      fix := case when i = 1 then nq else nw end;
      continue when fix is null;
      fix := regexp_replace(fix, r || ' = ANY \(ARRAY\[''designer''::text, ''manager''::text\]\)',
        format('(\1 = ''manager''::text OR ( SELECT public.can(%L, ''view'')))', area), 'g');
      fix := regexp_replace(fix, r || ' = ANY \(ARRAY\[''designer''::text, ''client''::text\]\)',
        format('(\1 = ''client''::text OR ( SELECT public.can(%L, ''edit'')))', area), 'g');
      fix := regexp_replace(fix, r || ' = ''designer''::text',
        format('( SELECT public.can(%L, %L))', area, case when p.cmd = 'SELECT' then 'view' else 'edit' end), 'g');
      if i = 1 then nq := fix; else nw := fix; end if;
    end loop;
    if nq is distinct from p.qual or nw is distinct from p.with_check then
      execute format('alter policy %I on public.%I%s%s', p.policyname, p.tablename,
        case when nq is distinct from p.qual then ' using (' || nq || ')' else '' end,
        case when nw is distinct from p.with_check then ' with check (' || nw || ')' else '' end);
    end if;
  end loop;
end $$;

-- The same for files: job files and deliveries are jobs, app files and client logos are clients,
-- and the logo and font on quotes are quotes.
do $$
declare
  p record;
  area text;
  r constant text := '(\( SELECT my_role\(\) AS my_role\)|my_role\(\))';
  nq text;
  nw text;
  fix text;
begin
  for p in select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    area := case
      when p.policyname in ('deliveries files: read', 'deliveries files: studio removes', 'deliveries files: studio uploads', 'designer removes inspiration', 'read inspiration', 'upload inspiration') then 'requests'
      when p.policyname in ('add app files', 'change app files', 'remove app files', 'see app files', 'brand logos: the business or its studio uploads') then 'clients'
      when p.policyname in ('add brand files', 'change brand files', 'remove brand files', 'see brand files') then 'quotes'
    end;
    continue when area is null;
    nq := p.qual;
    nw := p.with_check;
    for i in 1..2 loop
      fix := case when i = 1 then nq else nw end;
      continue when fix is null;
      fix := regexp_replace(fix, r || ' = ANY \(ARRAY\[''designer''::text, ''manager''::text\]\)',
        format('(\1 = ''manager''::text OR ( SELECT public.can(%L, ''view'')))', area), 'g');
      fix := regexp_replace(fix, r || ' = ''designer''::text',
        format('( SELECT public.can(%L, %L))', area, case when p.cmd = 'SELECT' then 'view' else 'edit' end), 'g');
      if i = 1 then nq := fix; else nw := fix; end if;
    end loop;
    if nq is distinct from p.qual or nw is distinct from p.with_check then
      execute format('alter policy %I on storage.objects%s%s', p.policyname,
        case when nq is distinct from p.qual then ' using (' || nq || ')' else '' end,
        case when nw is distinct from p.with_check then ' with check (' || nw || ')' else '' end);
    end if;
  end loop;
end $$;

-- Employees allowed to look at jobs or clients see the businesses (jobs show whose they are).
alter policy "members read businesses" on public.businesses
  using (workspace_id = (select public.view_workspace()) and (coalesce((select public.my_role()), '') <> 'staff'
    or (select public.can('requests', 'view')) or (select public.can('clients', 'view'))));

-- And the people in the workspace, for names on jobs, the People page and Team.
alter policy "read own member row" on public.members
  using (email = (select public.my_email()) or (workspace_id = (select public.view_workspace()) and (
    (select public.my_role()) = any (array['designer', 'manager'])
    or (select public.can('requests', 'view')) or (select public.can('clients', 'view')) or (select public.can('team', 'view')))));

-- Employees allowed to change clients add and remove client and manager logins. Adding employees
-- and setting what they can do stays with the owner.
drop policy if exists "clients editors manage client logins" on public.members;
create policy "clients editors manage client logins" on public.members for all to authenticated
  using (workspace_id = (select public.edit_workspace()) and role in ('client', 'manager') and (select public.can('clients', 'edit')))
  with check (workspace_id = (select public.edit_workspace()) and role in ('client', 'manager') and (select public.can('clients', 'edit')));

-- Signing tasks off: the owner, or an employee allowed to change Team, but never your own.
create or replace function public.check_staff_tick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.confirmed_at is distinct from (case when tg_op = 'UPDATE' then old.confirmed_at end)
     and new.confirmed_at is not null and not (
       public.my_role() = 'designer'
       or (public.can('team', 'edit') and (select t.assignee from public.staff_tasks t where t.id = new.task_id) <> public.my_email())
     ) then
    raise exception 'Only the owner can sign a task off';
  end if;
  if new.confirmed_at is not null and (tg_op = 'INSERT' or old.confirmed_at is null) then
    new.confirmed_by = public.my_email();
  end if;
  return new;
end $$;

-- Who has signed in yet, for People and Team.
create or replace function public.members_signed_in() returns setof text
language sql stable security definer set search_path = public, auth as $$
  select m.email from public.members m
  join auth.users u on lower(u.email) = m.email
  where m.workspace_id = public.edit_workspace() and (public.can('clients', 'view') or public.can('team', 'view')) and u.last_sign_in_at is not null
$$;

-- A client's logo and colour, set by the client or by the studio side.
create or replace function public.set_business_brand(p_business uuid, p_logo text, p_accent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (
    (my_role() = 'client' and p_business = any (my_businesses()) and edit_workspace() is not null)
    or (can('clients', 'edit') and exists (select 1 from businesses b where b.id = p_business and b.workspace_id = edit_workspace()))
  ) then
    raise exception 'You can only change your own business.';
  end if;
  if p_accent is not null and p_accent !~* '^#[0-9a-f]{6}$' then raise exception 'Pick a colour.'; end if;
  if p_logo is not null and p_logo <> '' and p_logo !~ '^https://[^ ]+/storage/v1/object/public/brand-logos/' then
    raise exception 'Upload the logo first.';
  end if;
  update businesses set logo_url = nullif(p_logo, ''), accent = p_accent where id = p_business;
end $$;
