-- Follow-ups on finished jobs. A manager can reply with notes on a finished job for a business
-- they're linked to (as well as on requests they sent), and a client or manager can send a new
-- request that follows on from a finished one; follows links the new job back to it.

alter table public.tickets add column if not exists follows bigint references public.tickets (id) on delete set null;

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
          and (t.created_by = public.my_email()
            or (t.business_id = any (public.my_businesses()) and t.status = public.final_stage(t.workspace_id)))))
    )
  );
