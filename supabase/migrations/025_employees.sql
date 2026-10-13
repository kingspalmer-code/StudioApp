-- Employees: people the owner adds to set tasks for. They sign in and see only their own to-do list.
-- No DELETE anywhere: removing a task sets gone, and unticking sets done to false.

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('designer', 'manager', 'client', 'staff'));

-- A to-do on an employee's list. Daily ones come back unticked each morning.
create table if not exists public.staff_tasks (
  id bigint generated always as identity primary key,
  workspace_id uuid not null default public.my_workspace() references public.workspaces (id) on delete cascade,
  assignee text not null references public.members (email) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  due date,
  daily boolean not null default false,
  gone boolean not null default false,
  created_by text not null default public.my_email(),
  created_at timestamptz not null default now()
);
create index if not exists staff_tasks_assignee_idx on public.staff_tasks (assignee, gone);

-- Each time a task is ticked off, with a note on how it went. A one-off task has one; a daily task
-- has one per day, so the owner can look back at what got done.
create table if not exists public.staff_task_ticks (
  task_id bigint not null references public.staff_tasks (id) on delete cascade,
  day date not null,
  done boolean not null default true,
  note text not null default '',
  done_by text not null default public.my_email(),
  done_at timestamptz not null default now(),
  primary key (task_id, day)
);

alter table public.staff_tasks enable row level security;
alter table public.staff_task_ticks enable row level security;

-- The owner sees every employee's list; an employee sees their own.
create policy "see staff tasks" on public.staff_tasks for select to authenticated using (
  workspace_id = public.view_workspace() and (public.my_role() = 'designer' or assignee = public.my_email())
);
-- The owner adds tasks for any employee; an employee adds tasks for themselves.
create policy "add staff tasks" on public.staff_tasks for insert to authenticated with check (
  workspace_id = public.edit_workspace()
  and (public.my_role() = 'designer' or (public.my_role() = 'staff' and assignee = public.my_email()))
  and exists (select 1 from public.members m where m.email = assignee and m.workspace_id = staff_tasks.workspace_id and m.role = 'staff')
);
-- The owner changes any task; an employee changes only the ones they added.
create policy "change staff tasks" on public.staff_tasks for update to authenticated
  using (workspace_id = public.edit_workspace() and (public.my_role() = 'designer' or (assignee = public.my_email() and created_by = public.my_email())))
  with check (workspace_id = public.edit_workspace() and (public.my_role() = 'designer' or (assignee = public.my_email() and created_by = public.my_email())));

-- Ticks follow the task: whoever can see it can see its ticks; the employee and the owner can tick it.
create policy "see ticks" on public.staff_task_ticks for select to authenticated using (
  exists (select 1 from public.staff_tasks t where t.id = task_id)
);
create policy "add ticks" on public.staff_task_ticks for insert to authenticated with check (
  exists (select 1 from public.staff_tasks t where t.id = task_id and t.workspace_id = public.edit_workspace()
    and (t.assignee = public.my_email() or public.my_role() = 'designer'))
);
create policy "change ticks" on public.staff_task_ticks for update to authenticated
  using (exists (select 1 from public.staff_tasks t where t.id = task_id and t.workspace_id = public.edit_workspace()
    and (t.assignee = public.my_email() or public.my_role() = 'designer')))
  with check (exists (select 1 from public.staff_tasks t where t.id = task_id and t.workspace_id = public.edit_workspace()
    and (t.assignee = public.my_email() or public.my_role() = 'designer')));

-- Employees see none of the workspace's customers or businesses (they never see jobs either).
alter policy "members read businesses" on public.businesses
  using (workspace_id = public.view_workspace() and coalesce(public.my_role(), '') <> 'staff');
