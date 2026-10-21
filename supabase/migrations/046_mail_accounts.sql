-- Sending quotes and invoices from your own Gmail (2026-10-21). The owner (or an employee who can
-- edit quotes) connects a Gmail account in Settings > Quotes & invoices; Send then goes out through
-- it, from that address, and lands in its Sent folder. One account per workspace.
-- refresh_token is encrypted by the app (MAIL_TOKEN_KEY) before it is stored, so the row alone
-- can't send anything.

create table if not exists public.mail_accounts (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text not null,
  refresh_token text not null,
  connected_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.mail_accounts enable row level security;

create policy "quotes editors see the mail account" on public.mail_accounts for select to authenticated
  using (workspace_id = (select public.view_workspace()) and (select public.can('quotes', 'edit')));
create policy "quotes editors connect a mail account" on public.mail_accounts for insert to authenticated
  with check (workspace_id = (select public.edit_workspace()) and (select public.can('quotes', 'edit')));
create policy "quotes editors reconnect the mail account" on public.mail_accounts for update to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('quotes', 'edit')))
  with check (workspace_id = (select public.edit_workspace()) and (select public.can('quotes', 'edit')));
create policy "quotes editors disconnect the mail account" on public.mail_accounts for delete to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('quotes', 'edit')));
