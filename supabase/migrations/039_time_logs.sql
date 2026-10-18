-- Hours worked: logged against a job, straight from the job page or from a to-do or step on the
-- calendar that belongs to one. A job's hours add up on its page. A timer is a log with a start
-- and no minutes yet. No DELETE: removing a log sets gone.

create table if not exists public.time_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null default public.my_workspace() references public.workspaces (id) on delete cascade,
  who text not null default public.my_email() references public.members (email) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete cascade,
  plan_item_id bigint references public.plan_items (id) on delete set null,
  day date not null default (now() at time zone 'Europe/London')::date,
  minutes int check (minutes is null or minutes between 1 and 10080),
  started_at timestamptz,
  note text not null default '',
  gone boolean not null default false,
  created_at timestamptz not null default now(),
  check (minutes is not null or started_at is not null)
);
create index if not exists time_logs_ticket_idx on public.time_logs (ticket_id) where not gone;
create index if not exists time_logs_item_idx on public.time_logs (plan_item_id) where not gone;
create index if not exists time_logs_who_idx on public.time_logs (workspace_id, who) where not gone;

alter table public.time_logs enable row level security;

-- The owner sees everyone's hours; an employee sees their own, or everyone's if they may look at Team.
create policy "see time logs" on public.time_logs for select to authenticated using (
  workspace_id = (select public.view_workspace())
  and ((select public.my_role()) = 'designer' or who = (select public.my_email()) or (select public.can('team', 'view')))
);
-- People log their own time, on a job they can see or one their to-do belongs to.
create policy "add time logs" on public.time_logs for insert to authenticated with check (
  workspace_id = (select public.edit_workspace())
  and who = (select public.my_email())
  and (select public.my_role()) in ('designer', 'staff')
  and (ticket_id is null
    or exists (select 1 from public.tickets t where t.id = ticket_id)
    or exists (select 1 from public.plan_items p where p.id = plan_item_id and p.ticket_id = time_logs.ticket_id))
);
create policy "change time logs" on public.time_logs for update to authenticated
  using (workspace_id = (select public.edit_workspace())
    and (who = (select public.my_email()) or (select public.my_role()) = 'designer' or (select public.can('team', 'edit'))))
  with check (workspace_id = (select public.edit_workspace())
    and (who = (select public.my_email()) or (select public.my_role()) = 'designer' or (select public.can('team', 'edit'))));
