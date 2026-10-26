-- Habits (2026-10-26): everyone's own habits, whatever kind of login they have. Each habit keeps its
-- own pace (every day, some weekdays, or a number of times every few weeks) and logs in its own way:
-- a session with an amount (a run in km), taps toward a daily count (glasses of water), or money
-- spent against a daily budget. Logging is sliding right; sliding left skips the day. Misses never
-- reset anything; after a couple, the page offers an easier goal (eased_from keeps the old one so
-- it can offer to step back up). Private to the person: nobody else, owner included, can see them.
-- No DELETE anywhere: removing sets gone.

create table if not exists public.habits (
  id bigint generated always as identity primary key,
  owner text not null default public.my_email() references public.members (email) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  -- session: one log with an amount (km, minutes); count: taps toward per_day; money: spent vs per_day budget.
  kind text not null default 'session' check (kind in ('session', 'count', 'money')),
  icon text not null default 'spark',
  colour text not null default '#d9822b',
  unit text not null default '',
  -- count: how many a day (6 glasses); money: the day's budget in pounds.
  per_day numeric not null default 1 check (per_day > 0),
  -- Names for each tap of a count, e.g. Breakfast, Lunch, Dinner.
  labels text[] not null default '{}',
  -- daily: every day; days: the weekdays in days (0 = Monday); times: times_per every period_weeks weeks.
  freq text not null default 'daily' check (freq in ('daily', 'days', 'times')),
  days smallint[] not null default '{}',
  times_per smallint not null default 1 check (times_per between 1 and 21),
  period_weeks smallint not null default 1 check (period_weeks between 1 and 8),
  part text not null default 'any' check (part in ('morning', 'afternoon', 'evening', 'any')),
  -- A nudge to the phone at this time on a day it's due and not yet logged.
  remind_at time,
  nudged_on date,
  -- The goal before it was eased off, and when the ease-off card was last answered.
  eased_from jsonb,
  ease_asked_on date,
  rank double precision not null default 0,
  gone boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists habits_owner_idx on public.habits (owner, gone);
create index if not exists habits_remind_idx on public.habits (remind_at) where remind_at is not null and not gone;

create table if not exists public.habit_logs (
  id bigint generated always as identity primary key,
  habit_id bigint not null references public.habits (id) on delete cascade,
  owner text not null default public.my_email() references public.members (email) on delete cascade,
  on_date date not null,
  status text not null default 'done' check (status in ('done', 'skip')),
  -- km, minutes, pounds spent, or 1 for a tap of a count.
  amount numeric,
  feel text check (feel in ('tough', 'good', 'flying')),
  tags text[] not null default '{}',
  note text not null default '' check (length(note) <= 500),
  gone boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists habit_logs_owner_idx on public.habit_logs (owner, on_date);
create index if not exists habit_logs_habit_idx on public.habit_logs (habit_id, on_date);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy "see own habits" on public.habits for select to authenticated using (owner = (select public.my_email()));
create policy "add own habits" on public.habits for insert to authenticated with check (owner = (select public.my_email()));
create policy "change own habits" on public.habits for update to authenticated
  using (owner = (select public.my_email())) with check (owner = (select public.my_email()));

create policy "see own habit logs" on public.habit_logs for select to authenticated using (owner = (select public.my_email()));
create policy "add own habit logs" on public.habit_logs for insert to authenticated with check (
  owner = (select public.my_email())
  and exists (select 1 from public.habits h where h.id = habit_id and h.owner = (select public.my_email()))
);
create policy "change own habit logs" on public.habit_logs for update to authenticated
  using (owner = (select public.my_email())) with check (owner = (select public.my_email()));

-- Habit nudges that are due: a habit with a nudge time that has passed today, due today, and not
-- yet logged or skipped. Marks each one nudged for the day and hands it back for the phone. Called
-- by /api/cron/reminders (every five minutes, migration 040) with the alerts secret.
-- Periods of "times every N weeks" count from Monday 1 January 2024, as lib/habits.ts does.
create or replace function public.push_due_habits(p_secret text, p_tz text default 'Europe/London')
returns table (id bigint, email text, name text, kind text, per_day numeric, unit text)
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone p_tz)::date;
  clock time := (now() at time zone p_tz)::time;
  monday date := date_trunc('week', (now() at time zone p_tz))::date;
begin
  perform push_check(p_secret);
  return query
  with due as (
    update habits h set nudged_on = today
    where not h.gone and h.remind_at is not null and h.remind_at <= clock
      and h.nudged_on is distinct from today
      and (h.freq = 'daily'
        or (h.freq = 'days' and (extract(isodow from today)::int - 1)::smallint = any (h.days))
        or (h.freq = 'times' and (
          select count(distinct l.on_date) from habit_logs l
          where l.habit_id = h.id and not l.gone and l.status = 'done'
            and l.on_date >= monday - (((monday - date '2024-01-01') / 7) % h.period_weeks) * 7
        ) < h.times_per))
      and not exists (select 1 from habit_logs l where l.habit_id = h.id and not l.gone and l.on_date = today and l.status = 'skip')
      and not (case when h.kind = 'count'
        then coalesce((select sum(coalesce(l.amount, 1)) from habit_logs l where l.habit_id = h.id and not l.gone and l.on_date = today and l.status = 'done'), 0) >= h.per_day
        else exists (select 1 from habit_logs l where l.habit_id = h.id and not l.gone and l.on_date = today and l.status = 'done') end)
    returning h.id, h.owner, h.name, h.kind, h.per_day, h.unit
  )
  select d.id, d.owner, d.name, d.kind, d.per_day, d.unit from due d;
end $$;
revoke execute on function public.push_due_habits(text, text) from public;
grant execute on function public.push_due_habits(text, text) to anon, authenticated;
