-- Show a job to a client from another business (2026-10-20). The studio can pick any client in the
-- workspace under "Also tell" on a job, not only the job's own business's. A picked client sees that
-- one job: its page, notes, drafts and files, and hears about it like anyone else picked. Nothing
-- else of that business shows to them. Existing policies are unchanged; these only add.

-- The job itself. Notes, drafts, files and the timeline already follow whoever can see the job.
drop policy if exists "see jobs shared with you" on public.tickets;
create policy "see jobs shared with you" on public.tickets for select to authenticated
  using ((select public.my_role()) = 'client' and workspace_id = (select public.view_workspace()) and (select public.my_email()) = any (tell));

-- Its uploaded files and drafts: stored under <business>/<job>/...
drop policy if exists "shared job files: read" on storage.objects;
create policy "shared job files: read" on storage.objects for select to authenticated
  using (
    bucket_id in ('inspiration', 'deliveries') and (select public.my_role()) = 'client'
    and exists (
      select 1 from public.tickets t
      where t.id::text = (storage.foldername(objects.name))[2] and t.business_id::text = (storage.foldername(objects.name))[1]
        and (select public.my_email()) = any (t.tell)
    )
  );

-- The bell: a picked client hears about the job even when it's another business's.
create or replace function public.notify_job(p_ticket bigint, p_kind text, p_body text, p_studio boolean, p_people boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      or (m.role = 'client' and (m.email = any (t.tell) or m.business_id = t.business_id
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
end $function$;
