-- One place for to-dos (2026-10-19). Personal to-dos move into To-do (plan_items), each onto its
-- owner's own list after what's already there: flagged ones first, then by date. Done ones come
-- across done. Nothing is deleted: personal_tasks stays as it was, as a backup. Safe to run twice:
-- a to-do already copied (same owner, title and created time) isn't copied again.

-- Copying isn't someone putting something on your list, so no bell for it.
alter table public.plan_items disable trigger plan_items_notify;

insert into public.plan_items (workspace_id, owner, title, notes, rank, on_date, remind, done_at, created_by, created_at)
select m.workspace_id, t.owner_email, t.title, t.notes,
  coalesce((select max(p.rank) from public.plan_items p where p.owner = t.owner_email and p.parent_id is null), 0)
    + row_number() over (partition by t.owner_email order by t.flagged desc, t.due nulls last, t.created_at),
  t.due,
  -- No reminders for copied ones, so a stack of old due dates doesn't all ping at once.
  null,
  case when t.done then coalesce(t.done_at, now()) end,
  t.owner_email, t.created_at
from public.personal_tasks t
join public.members m on m.email = t.owner_email and m.role in ('designer', 'staff')
where not exists (
  select 1 from public.plan_items p where p.owner = t.owner_email and p.title = t.title and p.created_at = t.created_at
);

alter table public.plan_items enable trigger plan_items_notify;

-- The morning alert counts to-dos from To-do now, for everyone with a list (employees too).
create or replace function public.push_morning_digest(p_secret text, p_today date)
returns table (email text, tasks int, jobs int, first_title text)
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query
  with people as (
    select distinct s.email from push_subscriptions s where s.morning and not s.gone
  ),
  last_stage as (
    select distinct on (st.workspace_id) st.workspace_id, st.key from stages st order by st.workspace_id, st.position desc, st.id desc
  ),
  due as (
    select p.owner as who, p.title, p.on_date as due, 'task' as kind
    from plan_items p
    where p.done_at is null and not p.gone and p.on_date <= p_today
    union all
    select m.email, j.title, j.deadline, 'job'
    from members m
    join tickets j on j.workspace_id = m.workspace_id
    left join last_stage ls on ls.workspace_id = j.workspace_id
    where m.role = 'designer' and j.deadline <= p_today and j.status is distinct from ls.key
  )
  select p.email,
    (count(*) filter (where d.kind = 'task'))::int,
    (count(*) filter (where d.kind = 'job'))::int,
    (array_agg(d.title order by d.due, d.title))[1]
  from people p
  join due d on d.who = p.email
  group by p.email;
end $$;
