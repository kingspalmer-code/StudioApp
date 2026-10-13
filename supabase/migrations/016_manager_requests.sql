-- Managers who send requests. A manager keeps the overview of every job, and can also send
-- requests for the businesses they're linked to in member_businesses (none unless the studio
-- links some on the People page). Requests go in exactly as a client's would.

alter policy "submit tickets" on public.tickets
  with check (
    workspace_id = public.edit_workspace() and (
      public.my_role() = 'designer'
      or (public.my_role() in ('client', 'manager') and business_id = any (public.my_businesses())
          and status = public.first_stage(workspace_id) and pinned = false and created_by = public.my_email())
    )
  );

alter policy "upload inspiration" on storage.objects
  with check (
    bucket_id = 'inspiration' and (
      (public.my_role() = 'designer'
        and exists (select 1 from public.businesses b
          where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
      or (public.my_role() in ('client', 'manager') and (storage.foldername(name))[1] = any (public.my_businesses()::text[]))
    )
  );

-- A manager can attach files to the requests they sent themselves.
alter policy "add files" on public.ticket_files
  with check (
    (public.my_role() in ('designer', 'client')
      and exists (select 1 from public.tickets t where t.id = ticket_files.ticket_id and t.workspace_id = public.edit_workspace()))
    or (public.my_role() = 'manager'
      and exists (select 1 from public.tickets t where t.id = ticket_files.ticket_id and t.workspace_id = public.edit_workspace()
        and t.created_by = public.my_email()))
  );

create or replace function public.note_brief_help() returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := public.edit_workspace();
  who text := coalesce(public.my_business()::text, public.my_email());
begin
  if ws is null or public.my_role() not in ('client', 'designer', 'manager') then raise exception 'Sign in to your portal first.'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and what = 'ask-brief:' || who and at > now() - interval '1 day') >= 15 then
    raise exception 'That''s all the brief help for today. You can still send the request as it is.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1500 then
    raise exception 'Oatcake is busy today. You can still send the request as it is.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, 'ask-brief:' || who);
end $$;
