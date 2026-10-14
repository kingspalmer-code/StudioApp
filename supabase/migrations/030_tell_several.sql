-- More than one person can be kept updated on a job. tickets.tell replaces tickets.notify (left in
-- place, no longer used): the studio can tick any of the business's clients and any manager.

alter table public.tickets add column if not exists tell text[] not null default '{}';
update public.tickets set tell = array[notify] where notify is not null and tell = '{}';

-- Notifications: whoever sent the job and everyone kept updated.
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
  select id, title, workspace_id, business_id, created_by, tell into t from tickets where id = p_ticket;
  if not found then return; end if;
  select coalesce(nullif(full_name, ''), email) into who from members where email = me;
  select u.raw_user_meta_data ->> 'avatar_url' into pic from auth.users u where lower(u.email) = me limit 1;

  select array_agg(distinct m.email) into recips from members m
  where m.workspace_id = t.workspace_id and m.email <> me and (
    (p_studio and m.role = 'designer')
    or (p_people and (m.email = t.created_by or m.email = any (t.tell)) and (m.role = 'manager'
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

-- A manager kept updated on a job can leave notes on it and its drafts.
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
          and (t.created_by = public.my_email() or public.my_email() = any (t.tell)
            or (t.business_id = any (public.my_businesses()) and t.status = public.final_stage(t.workspace_id)))))
    )
  );
