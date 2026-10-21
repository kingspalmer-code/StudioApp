-- Needed by can be hidden on the job form (Settings > Job form), and then jobs save without a date.
-- Dates already saved stay as they are, so showing the field again brings them back.
alter table public.tickets alter column deadline drop not null;
