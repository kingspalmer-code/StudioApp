-- Drafts: the studio shares work in progress on a job for the client's notes, before the
-- finished files go up. A draft is one round: a message and some files (in the private
-- 'deliveries' bucket under <business_id>/<ticket_id>/drafts/, so the same people can open them)
-- or links. Drafts never show in galleries; sending one as final copies its files into the
-- finished files. Notes on a draft are ordinary job notes with draft_id set.
-- Also lets a manager add notes to a request they sent, like a client can.

create table if not exists public.ticket_drafts (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  message text not null default '',
  final_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ticket_drafts_ticket on public.ticket_drafts (ticket_id);
alter table public.ticket_drafts enable row level security;

create table if not exists public.ticket_draft_files (
  id bigint generated always as identity primary key,
  draft_id bigint not null references public.ticket_drafts (id) on delete cascade,
  path text,
  url text,
  name text not null check (length(trim(name)) > 0),
  size bigint not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now(),
  check ((path is null) <> (url is null))
);
create index if not exists ticket_draft_files_draft on public.ticket_draft_files (draft_id);
alter table public.ticket_draft_files enable row level security;

-- Anyone who can see the job sees its drafts; only the studio adds, changes or removes them.
create policy "drafts: see with the job" on public.ticket_drafts
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy "drafts: studio adds" on public.ticket_drafts
  for insert to authenticated with check (
    public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace())
  );
create policy "drafts: studio changes" on public.ticket_drafts
  for update to authenticated
  using (public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace()))
  with check (public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace()));
create policy "drafts: studio removes" on public.ticket_drafts
  for delete to authenticated using (
    public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace())
  );

create policy "draft files: see with the draft" on public.ticket_draft_files
  for select to authenticated using (exists (select 1 from public.ticket_drafts d where d.id = draft_id));
create policy "draft files: studio adds" on public.ticket_draft_files
  for insert to authenticated with check (
    public.my_role() = 'designer'
    and exists (select 1 from public.ticket_drafts d join public.tickets t on t.id = d.ticket_id
      where d.id = draft_id and t.workspace_id = public.edit_workspace())
  );
create policy "draft files: studio removes" on public.ticket_draft_files
  for delete to authenticated using (
    public.my_role() = 'designer'
    and exists (select 1 from public.ticket_drafts d join public.tickets t on t.id = d.ticket_id
      where d.id = draft_id and t.workspace_id = public.edit_workspace())
  );

alter table public.ticket_notes add column if not exists draft_id bigint references public.ticket_drafts (id) on delete cascade;
create index if not exists ticket_notes_draft on public.ticket_notes (draft_id) where draft_id is not null;

-- A note on a draft must be on that draft's job. Managers can add notes to requests they sent.
alter policy "add notes" on public.ticket_notes
  with check (
    author_email = public.my_email()
    and (draft_id is null
      or exists (select 1 from public.ticket_drafts d where d.id = ticket_notes.draft_id and d.ticket_id = ticket_notes.ticket_id))
    and (
      (public.my_role() in ('designer', 'client')
        and exists (select 1 from public.tickets t where t.id = ticket_notes.ticket_id and t.workspace_id = public.edit_workspace()))
      or (public.my_role() = 'manager'
        and exists (select 1 from public.tickets t where t.id = ticket_notes.ticket_id and t.workspace_id = public.edit_workspace()
          and t.created_by = public.my_email()))
    )
  );
