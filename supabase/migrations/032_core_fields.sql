-- The fields at the top of every new job form (customer, title, type, needed-by, importance) can be
-- renamed, given a different hint, reordered and, where the app can do without them, hidden.
-- Stored per workspace; empty means the defaults. See lib/core-fields.ts.
alter table public.workspaces add column if not exists core_fields jsonb not null default '{}'::jsonb;
