-- Phone alerts: Web Push subscriptions for the people who run a workspace, a log so each alert
-- goes out once, and the morning round-up of what's due. Nobody can read or change these tables
-- directly. The server reaches them through the push_* functions below, which only work with
-- the alerts secret (PUSH_SECRET in Vercel, stored here in private_settings).

create table if not exists public.private_settings (
  name text primary key,
  value text not null
);
alter table public.private_settings enable row level security;

-- One row per phone or browser that has alerts turned on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  email text not null check (email = lower(email)),
  p256dh text not null,
  auth text not null,
  device text not null default '',
  new_requests boolean not null default true,
  morning boolean not null default true,
  -- Turned off or forgotten by the push service. Kept rather than deleted; saving the device again revives it.
  gone boolean not null default false,
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

create or replace function public.push_check(p_secret text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is null or length(p_secret) < 32
     or p_secret is distinct from (select value from private_settings where name = 'push_secret') then
    raise exception 'Not allowed';
  end if;
end $$;

-- A device turned alerts on. It takes the person's choices from their other devices.
create or replace function public.push_save(p_secret text, p_email text, p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
declare prev record;
begin
  perform push_check(p_secret);
  select new_requests, morning into prev from push_subscriptions where email = lower(p_email) and not gone limit 1;
  insert into push_subscriptions (endpoint, email, p256dh, auth, device, new_requests, morning, gone)
  values (p_endpoint, lower(p_email), p_p256dh, p_auth, p_device, coalesce(prev.new_requests, true), coalesce(prev.morning, true), false)
  on conflict (endpoint) do update set email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth,
    device = excluded.device, new_requests = excluded.new_requests, morning = excluded.morning, gone = false;
end $$;

-- Pass p_email to only turn off the device if it's that person's; null turns it off whoever's it is.
create or replace function public.push_forget(p_secret text, p_endpoint text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  update push_subscriptions set gone = true where endpoint = p_endpoint and (p_email is null or email = lower(p_email));
end $$;

create or replace function public.push_kinds(p_secret text, p_email text)
returns table (new_requests boolean, morning boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query select s.new_requests, s.morning from push_subscriptions s where s.email = lower(p_email) and not s.gone limit 1;
end $$;

create or replace function public.push_set_kinds(p_secret text, p_email text, p_new_requests boolean, p_morning boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  update push_subscriptions set new_requests = p_new_requests, morning = p_morning where email = lower(p_email);
end $$;

-- The devices to alert. p_kind ('new_requests' or 'morning') skips devices with that kind off.
create or replace function public.push_targets(p_secret text, p_emails text[], p_kind text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query select s.endpoint, s.p256dh, s.auth from push_subscriptions s
  where not s.gone and s.email = any (select lower(e) from unnest(p_emails) e)
    and (p_kind is null or (p_kind = 'new_requests' and s.new_requests) or (p_kind = 'morning' and s.morning));
end $$;

-- True the first time it's called for an alert, false after, so each alert goes out once.
create or replace function public.push_first(p_secret text, p_kind text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  insert into push_log (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  return found;
end $$;

-- Who runs the workspace a job belongs to, and the customer's name, for a new-request alert.
create or replace function public.push_request_info(p_secret text, p_ticket bigint)
returns table (business text, emails text[])
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query
    select b.name, array(select m.email from members m where m.workspace_id = t.workspace_id and m.role = 'designer')
    from tickets t join businesses b on b.id = t.business_id
    where t.id = p_ticket;
end $$;

-- For each person with morning alerts on: their to-dos due today or overdue, and their
-- workspace's jobs needed by today that aren't in the last ("finished") stage yet.
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
    select t.owner_email as who, t.title, t.due, 'task' as kind
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
  join due d on d.who = p.email
  group by p.email;
end $$;

revoke execute on function public.push_check(text) from public, anon, authenticated;

-- Then, once, with the same value as PUSH_SECRET in Vercel:
-- insert into public.private_settings (name, value) values ('push_secret', '<PUSH_SECRET>');
