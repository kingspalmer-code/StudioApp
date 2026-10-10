-- How people use Oatcake, so admins can see where they spend time and where they get stuck.
-- The app records page views, time actively spent on each page, a few key actions, and errors
-- people see. People can turn this off in their account. Only Oatcake admins can read it.
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  workspace_id uuid default public.my_workspace(),
  kind text not null check (kind in ('view', 'time', 'action', 'error')),
  name text not null default '' check (length(name) <= 60),
  path text not null default '' check (length(path) <= 200),
  ms integer not null default 0 check (ms between 0 and 600000),
  meta jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists activity_created on public.activity (created_at);
create index if not exists activity_user on public.activity (user_id, created_at);

alter table public.activity enable row level security;
create policy "activity: record your own" on public.activity
  for insert to authenticated with check (user_id = auth.uid());
create policy "activity: admins read" on public.activity
  for select to authenticated using (public.is_platform_admin());

-- Everyone who has signed up, with how far they've got and how much they use Oatcake.
create or replace function public.admin_people()
returns table (
  user_id uuid, email text, name text, signed_up timestamptz, last_sign_in timestamptz,
  workspace_id uuid, workspace text, kind text, role text, is_admin boolean, walkthrough boolean, no_tracking boolean,
  jobs int, customers int, docs int, docs_sent int,
  active_ms_7d bigint, active_ms bigint, days_active int, last_seen timestamptz, open_help int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Admins only.'; end if;
  return query
  select u.id, lower(u.email)::text, coalesce(nullif(m.full_name, ''), u.raw_user_meta_data ->> 'full_name', '')::text,
    u.created_at, u.last_sign_in_at, m.workspace_id, w.name, w.kind, m.role,
    exists (select 1 from platform_admins pa where pa.email = lower(u.email)),
    coalesce((u.raw_user_meta_data ->> 'walkthrough_done')::boolean, false),
    coalesce((u.raw_user_meta_data ->> 'no_tracking')::boolean, false),
    (select count(*)::int from tickets t where t.workspace_id = m.workspace_id),
    (select count(*)::int from businesses b where b.workspace_id = m.workspace_id),
    (select count(*)::int from documents d where d.workspace_id = m.workspace_id),
    (select count(*)::int from documents d where d.workspace_id = m.workspace_id and d.sent_at is not null),
    a.ms7, a.ms, a.days, a.last_seen,
    (select count(*)::int from support_tickets s where s.user_id = u.id and s.status <> 'solved')
  from auth.users u
  left join members m on m.email = lower(u.email)
  left join workspaces w on w.id = m.workspace_id
  left join lateral (
    select coalesce(sum(x.ms) filter (where x.created_at > now() - interval '7 days'), 0)::bigint as ms7,
           coalesce(sum(x.ms), 0)::bigint as ms,
           count(distinct (x.created_at at time zone 'Europe/London')::date)::int as days,
           max(x.created_at) as last_seen
    from activity x where x.user_id = u.id
  ) a on true
  order by u.created_at desc;
end $$;

-- Sign-ups and active people per day (UK days), leaving out Oatcake admins.
create or replace function public.admin_daily(p_days int)
returns table (day date, signups int, active int, active_ms bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Admins only.'; end if;
  return query
  with staff as (select u.id from auth.users u join platform_admins p on p.email = lower(u.email)),
  days as (
    select generate_series((now() at time zone 'Europe/London')::date - (least(p_days, 365) - 1),
                           (now() at time zone 'Europe/London')::date, interval '1 day')::date as d
  ),
  su as (
    select (u.created_at at time zone 'Europe/London')::date as d, count(*) as n
    from auth.users u where u.id not in (select id from staff) group by 1
  ),
  ac as (
    select (x.created_at at time zone 'Europe/London')::date as d, count(distinct x.user_id) as n, sum(x.ms) as ms
    from activity x
    where x.created_at > now() - make_interval(days => least(p_days, 365) + 1) and x.user_id not in (select id from staff)
    group by 1
  )
  select days.d, coalesce(su.n, 0)::int, coalesce(ac.n, 0)::int, coalesce(ac.ms, 0)::bigint
  from days left join su on su.d = days.d left join ac on ac.d = days.d
  order by 1;
end $$;

-- Headline numbers for the admin overview.
create or replace function public.admin_summary()
returns table (people int, workspaces int, signups_7d int, signups_prev_7d int, active_7d int, active_prev_7d int,
               active_30d int, active_ms_7d bigint, open_help int, unread_help int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Admins only.'; end if;
  return query
  with staff as (select u.id from auth.users u join platform_admins p on p.email = lower(u.email)),
  a as (select * from activity x where x.created_at > now() - interval '30 days' and x.user_id not in (select id from staff))
  select
    (select count(*)::int from auth.users u where u.id not in (select id from staff)),
    (select count(*)::int from workspaces),
    (select count(*)::int from auth.users u where u.created_at > now() - interval '7 days' and u.id not in (select id from staff)),
    (select count(*)::int from auth.users u where u.created_at between now() - interval '14 days' and now() - interval '7 days' and u.id not in (select id from staff)),
    (select count(distinct a.user_id)::int from a where a.created_at > now() - interval '7 days'),
    (select count(distinct a.user_id)::int from a where a.created_at between now() - interval '14 days' and now() - interval '7 days'),
    (select count(distinct a.user_id)::int from a),
    (select coalesce(sum(a.ms), 0)::bigint from a where a.created_at > now() - interval '7 days'),
    (select count(*)::int from support_tickets s where s.status = 'open'),
    (select count(*)::int from support_tickets s where s.last_from = 'user' and s.status <> 'solved'
       and (s.admin_seen_at is null or s.admin_seen_at < s.updated_at));
end $$;

-- Each page: views, people, time spent, and how often a form there was started but not sent.
create or replace function public.admin_pages(p_days int)
returns table (path text, views int, people int, ms bigint, form_starts int, form_sends int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Admins only.'; end if;
  return query
  with staff as (select u.id from auth.users u join platform_admins p on p.email = lower(u.email))
  select x.path,
    (count(*) filter (where x.kind = 'view'))::int,
    count(distinct x.user_id)::int,
    coalesce(sum(x.ms), 0)::bigint,
    (count(*) filter (where x.kind = 'action' and x.name = 'form_start'))::int,
    (count(*) filter (where x.kind = 'action' and x.name = 'form_send'))::int
  from activity x
  where x.created_at > now() - make_interval(days => least(p_days, 365)) and x.user_id not in (select id from staff)
  group by x.path
  order by 2 desc
  limit 60;
end $$;

-- Signs someone got stuck: errors they saw, rapid repeated taps, and where they skipped the walkthrough.
create or replace function public.admin_problems(p_days int)
returns table (kind text, name text, path text, detail text, times int, people int, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Admins only.'; end if;
  return query
  with staff as (select u.id from auth.users u join platform_admins p on p.email = lower(u.email))
  select x.kind, x.name, x.path, coalesce(x.meta ->> 'text', '')::text,
    count(*)::int, count(distinct x.user_id)::int, max(x.created_at)
  from activity x
  where x.created_at > now() - make_interval(days => least(p_days, 365)) and x.user_id not in (select id from staff)
    and (x.kind = 'error' or x.name = 'walkthrough_skip')
  group by 1, 2, 3, 4
  order by 6 desc, 5 desc
  limit 60;
end $$;

revoke execute on function public.admin_people() from public, anon;
revoke execute on function public.admin_daily(int) from public, anon;
revoke execute on function public.admin_summary() from public, anon;
revoke execute on function public.admin_pages(int) from public, anon;
revoke execute on function public.admin_problems(int) from public, anon;
grant execute on function public.admin_people() to authenticated;
grant execute on function public.admin_daily(int) to authenticated;
grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_pages(int) to authenticated;
grant execute on function public.admin_problems(int) to authenticated;
