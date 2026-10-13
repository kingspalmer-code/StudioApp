-- Employee tasks, part two: the owner's notes on a task, a reply chain on each one, and sign-off.
-- An employee ticking off a one-off task asks for sign-off; it counts as finished once the owner
-- confirms it (or sends it back). Daily tasks are just ticked. Replies and sign-off go to the bell.

alter table public.staff_tasks add column if not exists details text not null default '';
alter table public.staff_task_ticks add column if not exists confirmed_at timestamptz;
alter table public.staff_task_ticks add column if not exists confirmed_by text;

-- Only the owner can sign a task off.
create or replace function public.check_staff_tick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.confirmed_at is distinct from (case when tg_op = 'UPDATE' then old.confirmed_at end)
     and new.confirmed_at is not null and public.my_role() <> 'designer' then
    raise exception 'Only the owner can sign a task off';
  end if;
  if new.confirmed_at is not null and (tg_op = 'INSERT' or old.confirmed_at is null) then
    new.confirmed_by = public.my_email();
  end if;
  return new;
end $$;
create or replace trigger staff_ticks_check before insert or update on public.staff_task_ticks
  for each row execute function public.check_staff_tick();

-- The reply chain on a task. kind: a plain note, asking for sign-off, signing off, or sending it back.
create table if not exists public.staff_task_notes (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.staff_tasks (id) on delete cascade,
  author text not null default public.my_email(),
  kind text not null default 'note' check (kind in ('note', 'ask', 'confirm', 'reopen')),
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists staff_task_notes_task_idx on public.staff_task_notes (task_id, created_at);
alter table public.staff_task_notes enable row level security;

create policy "see task notes" on public.staff_task_notes for select to authenticated using (
  exists (select 1 from public.staff_tasks t where t.id = task_id)
);
create policy "add task notes" on public.staff_task_notes for insert to authenticated with check (
  author = public.my_email()
  and (kind in ('note', 'ask') or public.my_role() = 'designer')
  and exists (select 1 from public.staff_tasks t where t.id = task_id and t.workspace_id = public.edit_workspace()
    and (t.assignee = public.my_email() or public.my_role() = 'designer'))
);

-- The bell: notifications can be about a task as well as a job.
alter table public.notifications add column if not exists staff_task_id bigint references public.staff_tasks (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'request', 'follow_up', 'job', 'note', 'draft_note', 'approval', 'files', 'draft', 'review', 'finished',
  'task', 'task_note', 'task_signoff', 'task_confirmed', 'task_reopened'));

-- Who hears about something on a task: the employee hears from the owner, the owners hear from the employee.
create or replace function public.task_people(p_task bigint)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.email), '{}') from staff_tasks t join members m on m.workspace_id = t.workspace_id
  where t.id = p_task and t.workspace_id = public.my_workspace() and m.email <> public.my_email()
    and (public.my_role() = 'designer' and m.email = t.assignee or public.my_role() = 'staff' and t.assignee = public.my_email() and m.role = 'designer')
$$;
grant execute on function public.task_people(bigint) to authenticated;

create or replace function public.notify_task(p_task bigint, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me text := public.my_email();
  who text;
  pic text;
  t_title text;
begin
  if me = '' then return; end if;
  select title into t_title from staff_tasks where id = p_task;
  if not found then return; end if;
  select coalesce(nullif(full_name, ''), email) into who from members where email = me;
  select u.raw_user_meta_data ->> 'avatar_url' into pic from auth.users u where lower(u.email) = me limit 1;
  insert into notifications (recipient, staff_task_id, kind, title, actor_email, actor_name, actor_avatar, body)
  select e, p_task, p_kind, t_title, me, coalesce(who, me), pic, left(coalesce(p_body, ''), 400) from unnest(public.task_people(p_task)) e;
end $$;
revoke execute on function public.notify_task(bigint, text, text) from public, anon, authenticated;

create or replace function public.notify_task_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_task(new.task_id,
    case new.kind when 'ask' then 'task_signoff' when 'confirm' then 'task_confirmed' when 'reopen' then 'task_reopened' else 'task_note' end,
    new.body);
  return null;
exception when others then
  raise warning 'notify_task_note: %', sqlerrm;
  return null;
end $$;
create or replace trigger staff_task_notes_notify after insert on public.staff_task_notes
  for each row execute function public.notify_task_note();

-- A task the owner sets lands in the employee's bell.
create or replace function public.notify_new_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'designer' then
    perform notify_task(new.id, 'task', new.details);
  end if;
  return null;
exception when others then
  raise warning 'notify_new_task: %', sqlerrm;
  return null;
end $$;
create or replace trigger staff_tasks_notify after insert on public.staff_tasks
  for each row execute function public.notify_new_task();
