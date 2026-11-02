-- Hours and pay (/hours): each logged stretch of time can say what kind of work it was and the
-- hourly rate it's paid at, so the team can see hours per person and job and what each is owed.
-- The owner marks hours paid. Employees who can't open jobs can still pick one to log against:
-- hour_jobs() lists the workspace's job titles (titles only) to anyone on the team.

alter table public.time_logs
  add column if not exists work_type text not null default '' check (length(work_type) <= 80),
  add column if not exists rate numeric(8,2) check (rate is null or (rate >= 0 and rate <= 10000)),
  add column if not exists paid_at timestamptz;

-- Is this job one of this workspace's? (Checked whatever the person may see of jobs.)
create or replace function public.is_team_job(job bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tickets t where t.id = job and t.workspace_id = public.view_workspace())
$$;
revoke execute on function public.is_team_job(bigint) from public, anon;
grant execute on function public.is_team_job(bigint) to authenticated;

-- Jobs to log hours against: the most recent few hundred, plus any that already have hours.
create or replace function public.hour_jobs() returns table (id bigint, title text, delivered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.delivered_at from tickets t
  where t.workspace_id = public.view_workspace()
    and public.my_role() in ('designer', 'staff')
    and (t.id in (select t2.id from tickets t2 where t2.workspace_id = public.view_workspace() order by t2.updated_at desc limit 400)
      or exists (select 1 from time_logs l where l.ticket_id = t.id and not l.gone))
  order by t.updated_at desc
$$;
revoke execute on function public.hour_jobs() from public, anon;
grant execute on function public.hour_jobs() to authenticated;

-- An employee on "To-do only" can log their own hours against any of the workspace's jobs.
-- (Policies add up, so the existing "add time logs" rule still applies as before.)
create policy "add hours to team jobs" on public.time_logs for insert to authenticated with check (
  workspace_id = (select public.edit_workspace())
  and who = (select public.my_email())
  and (select public.my_role()) in ('designer', 'staff')
  and ticket_id is not null
  and public.is_team_job(ticket_id)
);

-- Only the owner marks hours paid, and a log can only point at one of this workspace's jobs.
create or replace function public.time_logs_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' and new.paid_at is distinct from old.paid_at and public.my_role() is distinct from 'designer' then
      raise exception 'Only the owner can mark hours paid';
    end if;
    if tg_op = 'INSERT' and new.paid_at is not null then
      raise exception 'New hours start unpaid';
    end if;
    if new.ticket_id is not null and (tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id) and not public.is_team_job(new.ticket_id) then
      raise exception 'That job isn''t one of yours';
    end if;
  end if;
  return new;
end $$;

create or replace trigger time_logs_guard before insert or update on public.time_logs
  for each row execute function public.time_logs_guard();
