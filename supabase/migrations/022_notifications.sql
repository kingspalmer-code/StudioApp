-- Notifications: the bell in the top corner. Whenever someone does something on a job (sends a
-- request, leaves a note or replies, approves a draft, adds files, shares a draft, sends it for
-- review or finishes it), everyone else involved gets a row here: the studio, whoever sent the job,
-- anyone picked to keep updated, and anyone who has already written on it. Nobody is told about
-- their own actions. Rows are written by triggers, so every way of doing these things counts.
-- People can only read their own, and only mark them read or archived.

-- A note can be an approval: the client's "Approve" button on a draft.
alter table public.ticket_notes add column if not exists kind text not null default 'note' check (kind in ('note', 'approval'));

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  recipient text not null,
  ticket_id bigint references public.tickets (id) on delete cascade,
  kind text not null check (kind in ('request', 'follow_up', 'job', 'note', 'draft_note', 'approval', 'files', 'draft', 'review', 'finished')),
  title text not null default '',
  actor_email text not null default '',
  actor_name text not null default '',
  actor_avatar text,
  body text not null default '',
  count int not null default 1,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient on public.notifications (recipient, created_at desc);
alter table public.notifications enable row level security;

create policy "notifications: see your own" on public.notifications
  for select to authenticated using (recipient = public.my_email());
create policy "notifications: mark your own" on public.notifications
  for update to authenticated using (recipient = public.my_email()) with check (recipient = public.my_email());
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at, archived_at) on public.notifications to authenticated;

-- Tells everyone involved in a job, except whoever did it. p_studio: the workspace's designers.
-- p_people: whoever sent the job and whoever's kept updated, if they're a client or manager who can
-- see it. Everyone who has written a note on it is always told. Files added in a row by one person
-- go into one notification.
create or replace function public.notify_job(p_ticket bigint, p_kind text, p_body text, p_studio boolean, p_people boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  me text := public.my_email();
  who text;
  pic text;
  recips text[];
  merged text[];
begin
  if me = '' then return; end if;
  select id, title, workspace_id, business_id, created_by, notify into t from tickets where id = p_ticket;
  if not found then return; end if;
  select coalesce(nullif(full_name, ''), email) into who from members where email = me;
  select u.raw_user_meta_data ->> 'avatar_url' into pic from auth.users u where lower(u.email) = me limit 1;

  select array_agg(distinct m.email) into recips from members m
  where m.workspace_id = t.workspace_id and m.email <> me and (
    (p_studio and m.role = 'designer')
    or (p_people and m.email in (t.created_by, t.notify) and (m.role = 'manager'
      or (m.role = 'client' and (m.business_id = t.business_id
        or exists (select 1 from member_businesses mb where mb.email = m.email and mb.business_id = t.business_id)))))
    or exists (select 1 from ticket_notes n where n.ticket_id = p_ticket and n.author_email = m.email)
  );
  if recips is null then return; end if;

  if p_kind = 'files' then
    with done as (
      update notifications n set count = n.count + 1, body = left(n.body || ', ' || p_body, 400), created_at = now()
      where n.recipient = any (recips) and n.ticket_id = p_ticket and n.kind = 'files' and n.actor_email = me
        and n.read_at is null and n.archived_at is null and n.created_at > now() - interval '15 minutes'
      returning n.recipient
    )
    select array_agg(recipient) into merged from done;
    recips := array(select unnest(recips) except select unnest(coalesce(merged, '{}')));
  end if;

  insert into notifications (recipient, ticket_id, kind, title, actor_email, actor_name, actor_avatar, body)
  select e, p_ticket, p_kind, t.title, me, coalesce(who, me), pic, left(coalesce(p_body, ''), 400) from unnest(recips) e;
end $$;
revoke execute on function public.notify_job(bigint, text, text, boolean, boolean) from public, anon, authenticated;

-- A new job. Sent by a client or manager: the studio and anyone kept updated hear. Added by the
-- studio: the person picked to keep updated hears (and any other designers).
create or replace function public.notify_new_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role into r from members where email = public.my_email();
  perform notify_job(new.id,
    case when r = 'designer' then 'job' when new.follows is not null then 'follow_up' else 'request' end,
    new.brief, true, true);
  return null;
exception when others then
  raise warning 'notify_new_ticket: %', sqlerrm;
  return null;
end $$;
drop trigger if exists tickets_notify on public.tickets;
create trigger tickets_notify after insert on public.tickets for each row execute function public.notify_new_ticket();

create or replace function public.notify_new_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_job(new.ticket_id,
    case when new.kind = 'approval' then 'approval' when new.draft_id is not null then 'draft_note' else 'note' end,
    case when new.kind = 'approval' then '' else new.body end, true, true);
  return null;
exception when others then
  raise warning 'notify_new_note: %', sqlerrm;
  return null;
end $$;
drop trigger if exists ticket_notes_notify on public.ticket_notes;
create trigger ticket_notes_notify after insert on public.ticket_notes for each row execute function public.notify_new_note();

-- Files added after a job was sent. Ones sent with the request itself are part of the request.
create or replace function public.notify_new_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tickets t where t.id = new.ticket_id and t.created_by = public.my_email() and t.created_at > now() - interval '10 minutes') then
    return null;
  end if;
  perform notify_job(new.ticket_id, 'files', new.name, true, true);
  return null;
exception when others then
  raise warning 'notify_new_file: %', sqlerrm;
  return null;
end $$;
drop trigger if exists ticket_files_notify on public.ticket_files;
create trigger ticket_files_notify after insert on public.ticket_files for each row execute function public.notify_new_file();

-- Drafts shared, sent for review, finished: from the job's progress timeline. Plain stage moves aren't.
create or replace function public.notify_new_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'stage' then return null; end if;
  perform notify_job(new.ticket_id, new.kind,
    case when new.kind = 'draft' then coalesce((select d.message from ticket_drafts d where d.id = new.draft_id), '') else '' end,
    true, true);
  return null;
exception when others then
  raise warning 'notify_new_event: %', sqlerrm;
  return null;
end $$;
drop trigger if exists ticket_events_notify on public.ticket_events;
create trigger ticket_events_notify after insert on public.ticket_events for each row execute function public.notify_new_event();
