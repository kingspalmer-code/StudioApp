-- Job time calculator (Apps): past jobs typed in by hand, plus corrections to finished jobs whose
-- dates don't show how long they really took (left out, or a different number of days). Finished
-- jobs themselves are read straight from tickets. Belongs to the requests area, like the jobs.

create table if not exists public.job_timings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Set when this corrects a finished job; empty for a past job typed in by hand.
  ticket_id bigint unique references public.tickets (id) on delete cascade,
  type text not null default '' check (length(type) <= 80),
  size numeric check (size is null or (size >= 0 and size < 1e9)),
  -- Working days it took.
  days numeric check (days is null or (days > 0 and days <= 3650)),
  skip boolean not null default false,
  note text not null default '' check (length(note) <= 200),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check (ticket_id is not null or days is not null)
);
create index if not exists job_timings_workspace on public.job_timings (workspace_id);
alter table public.job_timings enable row level security;

create policy "timings: see" on public.job_timings
  for select to authenticated
  using (workspace_id = (select public.view_workspace()) and (select public.can('requests', 'view')));
create policy "timings: add" on public.job_timings
  for insert to authenticated
  with check (
    workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit'))
    and (ticket_id is null or exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = job_timings.workspace_id))
  );
create policy "timings: change" on public.job_timings
  for update to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')))
  with check (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')));
create policy "timings: remove" on public.job_timings
  for delete to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')));
