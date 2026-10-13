-- A job's progress, for the timeline at the bottom of the job page: each stage change, each draft
-- sent for review, and finishing it, with the files that went and who was told. Written by the
-- studio's own actions; anyone who can see the job can read it.

create table if not exists public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  kind text not null check (kind in ('stage', 'review', 'finished', 'draft')),
  stage text not null default '',
  draft_id bigint references public.ticket_drafts (id) on delete set null,
  -- File and link names that went with it.
  files jsonb not null default '[]',
  -- Names of the people at the business who were emailed.
  told jsonb not null default '[]',
  actor text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ticket_events_ticket on public.ticket_events (ticket_id, created_at);
alter table public.ticket_events enable row level security;

create policy "events: see with the job" on public.ticket_events
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy "events: studio adds" on public.ticket_events
  for insert to authenticated with check (
    public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace())
  );

-- Drafts shared before this, so they show on the timeline too.
-- Who was told is worked out the way the app does: whoever sent the job and anyone picked to keep updated.
insert into public.ticket_events (ticket_id, kind, draft_id, files, told, created_at)
select d.ticket_id, 'draft', d.id,
  coalesce((select jsonb_agg(f.name order by f.created_at) from public.ticket_draft_files f where f.draft_id = d.id), '[]'),
  coalesce((select jsonb_agg(distinct coalesce(nullif(m.full_name, ''), m.email)) from public.members m
    where m.email in (t.created_by, t.notify) and m.role in ('client', 'manager')), '[]'),
  d.created_at
from public.ticket_drafts d
join public.tickets t on t.id = d.ticket_id
where not exists (select 1 from public.ticket_events e where e.draft_id = d.id);
