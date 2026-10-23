-- To-do cards (2026-10-23). Things can run over several days ("in London until Monday"): on_date is
-- the first day, end_date the last (null for one day; reminders still go by on_date). Each card can
-- also have a colour, a group it sits in, a place, and a size on the board.
alter table public.plan_items
  add column if not exists end_date date,
  add column if not exists colour text,
  add column if not exists grp text not null default '',
  add column if not exists place text not null default '',
  add column if not exists size text not null default 's';
