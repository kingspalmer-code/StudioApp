-- Phone alerts: Web Push subscriptions for the people who run a workspace, a log so each alert
-- goes out once, and the morning round-up of what's due. Only the server (service role) reads
-- or writes these; the app reaches them through server actions.

-- One row per phone or browser that has alerts turned on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  email text not null check (email = lower(email)),
  p256dh text not null,
  auth text not null,
  device text not null default '',
  new_requests boolean not null default true,
  morning boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_email on public.push_subscriptions (email);
alter table public.push_subscriptions enable row level security;

-- Alerts already sent, so a request or a morning round-up is never sent twice.
create table if not exists public.push_log (
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.push_log enable row level security;

-- For each person with morning alerts on: their to-dos due today or overdue, and their
-- workspace's jobs needed by today that aren't in the last ("finished") stage yet.
create or replace function public.push_morning_digest(p_today date)
returns table (email text, tasks int, jobs int, first_title text)
language sql stable security definer set search_path = public as $$
  with people as (
    select distinct s.email from push_subscriptions s where s.morning
  ),
  last_stage as (
    select distinct on (workspace_id) workspace_id, key from stages order by workspace_id, position desc, id desc
  ),
  due as (
    select t.owner_email as email, t.title, t.due, 'task' as kind
    from personal_tasks t
    where not t.done and t.due <= p_today
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
  join due d on d.email = p.email
  group by p.email
$$;
revoke execute on function public.push_morning_digest(date) from public, anon, authenticated;
grant execute on function public.push_morning_digest(date) to service_role;
