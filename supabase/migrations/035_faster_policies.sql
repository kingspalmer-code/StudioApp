-- Speed: every access rule calls helpers like my_role() and view_workspace(). Written bare,
-- Postgres runs them again for every row it looks at (each one is its own lookup), so a list of
-- 20 businesses ran ~80 lookups. Wrapped as (select my_role()) they run once per query instead.
-- Nothing about who can see or change what is different; only how often the check is worked out.
--
-- This rewrites every policy in public that calls one of those helpers (or auth.uid()/auth.jwt())
-- without arguments. It skips calls already wrapped, so it is safe to run again, and new policies
-- can be written either way and fixed by re-running it.
do $$
declare
  p record;
  pat constant text := '(?<!SELECT )\m((?:public\.)?(?:view_workspace|edit_workspace|my_role|my_businesses|my_email|my_workspace|is_platform_admin)\(\)|auth\.(?:uid|jwt|email|role)\(\))';
  -- "x = any(my_businesses())" needs the cast once wrapped, or Postgres reads it as a subquery of arrays.
  arr constant text := 'ANY \(\(select ((?:public\.)?my_businesses\(\))\)\)';
  nq text;
  nw text;
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    nq := regexp_replace(regexp_replace(p.qual, pat, '(select \1)', 'g'), arr, 'ANY ((select \1)::uuid[])', 'g');
    nw := regexp_replace(regexp_replace(p.with_check, pat, '(select \1)', 'g'), arr, 'ANY ((select \1)::uuid[])', 'g');
    if nq is distinct from p.qual or nw is distinct from p.with_check then
      execute format('alter policy %I on public.%I%s%s', p.policyname, p.tablename,
        case when nq is distinct from p.qual then ' using (' || nq || ')' else '' end,
        case when nw is distinct from p.with_check then ' with check (' || nw || ')' else '' end);
    end if;
  end loop;
end $$;

-- Lookups by job (notes, files on the job page) and the other links the database adviser flagged
-- had no index, so each one read the whole table.
create index if not exists ticket_notes_ticket on public.ticket_notes (ticket_id);
create index if not exists ticket_files_ticket on public.ticket_files (ticket_id);
create index if not exists notifications_ticket on public.notifications (ticket_id);
create index if not exists notifications_staff_task on public.notifications (staff_task_id);
create index if not exists members_business on public.members (business_id);
create index if not exists apps_workspace on public.apps (workspace_id);
create index if not exists personal_tasks_project on public.personal_tasks (project_id);
create index if not exists staff_tasks_workspace on public.staff_tasks (workspace_id);
create index if not exists support_tickets_workspace on public.support_tickets (workspace_id);
create index if not exists ticket_events_draft on public.ticket_events (draft_id);
create index if not exists tickets_follows on public.tickets (follows);
create index if not exists tickets_notify on public.tickets (notify);
