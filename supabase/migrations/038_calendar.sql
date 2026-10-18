-- Calendar: a to-do list in priority order that fills a calendar. A to-do can belong to a job and
-- can have steps, each with its own day and time. Anything with a day shows on the calendar;
-- anything without one waits in the list. Reminders go to the bell and the phone.
-- No DELETE anywhere: removing sets gone.

create table if not exists public.plan_items (
  id bigint generated always as identity primary key,
  workspace_id uuid not null default public.my_workspace() references public.workspaces (id) on delete cascade,
  -- Whose list and calendar it's on: the owner's own, or an employee's.
  owner text not null default public.my_email() references public.members (email) on delete cascade,
  -- A step of another to-do.
  parent_id bigint references public.plan_items (id) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  -- Lower comes first in the list.
  rank double precision not null default 0,
  on_date date,
  at_time time,
  -- Minutes before it starts to send a reminder; null for none. Untimed ones remind at 8am.
  remind int check (remind is null or remind between 0 and 10080),
  reminded_at timestamptz,
  done_at timestamptz,
  gone boolean not null default false,
  created_by text not null default public.my_email(),
  created_at timestamptz not null default now()
);
create index if not exists plan_items_list_idx on public.plan_items (workspace_id, gone, owner);
create index if not exists plan_items_parent_idx on public.plan_items (parent_id);
create index if not exists plan_items_ticket_idx on public.plan_items (ticket_id);
create index if not exists plan_items_remind_idx on public.plan_items (on_date) where remind is not null and reminded_at is null and done_at is null and not gone;

alter table public.plan_items enable row level security;

-- The owner sees everyone's; an employee sees their own, or everyone's if they may look at Team.
create policy "see plan items" on public.plan_items for select to authenticated using (
  workspace_id = (select public.view_workspace())
  and ((select public.my_role()) = 'designer' or owner = (select public.my_email()) or (select public.can('team', 'view')))
);
-- Anyone adds to their own; the owner (or an employee who may change Team) adds to an employee's.
create policy "add plan items" on public.plan_items for insert to authenticated with check (
  workspace_id = (select public.edit_workspace())
  and (select public.my_role()) in ('designer', 'staff')
  and (owner = (select public.my_email()) or (select public.can('team', 'edit')))
  and exists (select 1 from public.members m where m.email = owner and m.workspace_id = plan_items.workspace_id and m.role in ('designer', 'staff'))
);
create policy "change plan items" on public.plan_items for update to authenticated
  using (workspace_id = (select public.edit_workspace())
    and ((select public.my_role()) = 'designer' or owner = (select public.my_email()) or (select public.can('team', 'edit'))))
  with check (workspace_id = (select public.edit_workspace())
    and ((select public.my_role()) = 'designer' or owner = (select public.my_email()) or (select public.can('team', 'edit'))));

-- Moving something to a new day or time, or unticking it, lets its reminder go out again.
create or replace function public.plan_item_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.on_date is distinct from old.on_date or new.at_time is distinct from old.at_time
     or new.remind is distinct from old.remind or (old.done_at is not null and new.done_at is null) then
    new.reminded_at = null;
  end if;
  return new;
end $$;
create or replace trigger plan_items_touch before update on public.plan_items
  for each row execute function public.plan_item_touch();

-- The bell: notifications can be about something on the calendar.
alter table public.notifications add column if not exists plan_item_id bigint references public.plan_items (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'request', 'follow_up', 'job', 'note', 'draft_note', 'approval', 'files', 'draft', 'review', 'finished',
  'task', 'task_note', 'task_signoff', 'task_confirmed', 'task_reopened',
  'plan', 'reminder'));

-- Something put on an employee's calendar by someone else lands in their bell.
create or replace function public.notify_plan_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := public.my_email();
  who text;
begin
  if me = '' or new.owner = me then return null; end if;
  select coalesce(nullif(full_name, ''), email) into who from members where email = me;
  insert into notifications (recipient, plan_item_id, kind, title, actor_email, actor_name, body)
  values (new.owner, new.id, 'plan', new.title, me, coalesce(who, me), left(new.notes, 400));
  return null;
exception when others then
  raise warning 'notify_plan_item: %', sqlerrm;
  return null;
end $$;
create or replace trigger plan_items_notify after insert on public.plan_items
  for each row execute function public.notify_plan_item();

-- Reminders that are due: marks each one sent, puts it in the bell, and hands it back for the
-- phone. Called every few minutes by /api/cron/reminders with the alerts secret. Anything more
-- than a day late is skipped rather than sent long after it mattered.
create or replace function public.push_due_reminders(p_secret text, p_tz text default 'Europe/London')
returns table (id bigint, email text, title text, parent_title text, on_date date, at_time time)
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query
  with due as (
    update plan_items p set reminded_at = now()
    where p.remind is not null and p.reminded_at is null and p.done_at is null and not p.gone and p.on_date is not null
      and p.on_date between (now() at time zone p_tz)::date - 1 and (now() at time zone p_tz)::date + 8
      and ((p.on_date + coalesce(p.at_time, time '08:00')) at time zone p_tz) - make_interval(mins => p.remind) <= now()
      and ((p.on_date + coalesce(p.at_time, time '08:00')) at time zone p_tz) > now() - interval '1 day'
    returning p.id, p.owner, p.title, p.parent_id, p.on_date, p.at_time
  ), bell as (
    insert into notifications (recipient, plan_item_id, kind, title, actor_email, actor_name, body)
    select d.owner, d.id, 'reminder', d.title, '', 'Oatcake', coalesce(par.title, '')
    from due d left join plan_items par on par.id = d.parent_id
  )
  select d.id, d.owner, d.title, par.title, d.on_date, d.at_time
  from due d left join plan_items par on par.id = d.parent_id;
end $$;
