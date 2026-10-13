-- A manager the studio picked to keep updated on a job can leave notes on it and its drafts, as
-- they can on requests they sent themselves.

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
          and (t.created_by = public.my_email() or t.notify = public.my_email()
            or (t.business_id = any (public.my_businesses()) and t.status = public.final_stage(t.workspace_id)))))
    )
  );
