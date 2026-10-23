-- Things on To-do can run over several days ("in London until Monday"): on_date is the first day,
-- end_date the last. Null for a single day. Nothing else changes; reminders still go by on_date.
alter table public.plan_items add column if not exists end_date date;
