-- Quotes and invoices. Each workspace sets up its look once (logo, heading font, colour, business
-- details) and then makes quotes and invoices from its jobs, as PDFs it can download or email.
-- Only the workspace owner (designer role) sees or changes any of it.

create table if not exists public.doc_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  business_name text not null default '',
  address text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  vat_registered boolean not null default false,
  vat_number text not null default '',
  vat_rate numeric(5, 2) not null default 20 check (vat_rate between 0 and 100),
  bank_details text not null default '',
  payment_days int not null default 14 check (payment_days between 0 and 365),
  quote_days int not null default 30 check (quote_days between 0 and 365),
  footer text not null default '',
  font text not null default 'helvetica',
  font_path text not null default '',
  accent text not null default '#382a25' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.doc_settings enable row level security;
create policy "owner sees document settings" on public.doc_settings
  for select to authenticated using (workspace_id = public.view_workspace() and public.my_role() = 'designer');
create policy "owner adds document settings" on public.doc_settings
  for insert to authenticated with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner edits document settings" on public.doc_settings
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');

create table if not exists public.documents (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete set null,
  kind text not null check (kind in ('quote', 'invoice')),
  number int not null default 0,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_address text not null default '',
  title text not null default '',
  items jsonb not null default '[]'::jsonb,   -- [{description, qty, unit_price}]
  notes text not null default '',
  issued_on date not null default current_date,
  due_on date,
  vat_rate numeric(5, 2),                     -- null when the business isn't VAT registered
  subtotal numeric(12, 2) not null default 0,
  vat numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'paid')),
  sent_at timestamptz,
  sent_to text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, kind, number)
);
create index if not exists documents_ticket_idx on public.documents (ticket_id);

-- Numbers run per workspace and kind (Quote 1, 2, 3…); totals always come from the line items.
create or replace function public.prepare_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare sub numeric := 0; item jsonb;
begin
  if tg_op = 'INSERT' then
    select coalesce(max(number), 0) + 1 into new.number from documents where workspace_id = new.workspace_id and kind = new.kind;
  else
    new.workspace_id := old.workspace_id;
    new.kind := old.kind;
    new.number := old.number;
  end if;
  if jsonb_typeof(new.items) <> 'array' then new.items := '[]'::jsonb; end if;
  for item in select * from jsonb_array_elements(new.items) loop
    sub := sub + round(coalesce((item ->> 'qty')::numeric, 0) * coalesce((item ->> 'unit_price')::numeric, 0), 2);
  end loop;
  new.subtotal := sub;
  new.vat := case when new.vat_rate is null then 0 else round(sub * new.vat_rate / 100, 2) end;
  new.total := new.subtotal + new.vat;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger prepare_document before insert or update on public.documents
  for each row execute function public.prepare_document();

alter table public.documents enable row level security;
create policy "owner sees documents" on public.documents
  for select to authenticated using (workspace_id = public.view_workspace() and public.my_role() = 'designer');
create policy "owner adds documents" on public.documents
  for insert to authenticated with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner edits documents" on public.documents
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner removes documents" on public.documents
  for delete to authenticated using (workspace_id = public.edit_workspace() and public.my_role() = 'designer');

-- Logos and uploaded fonts, stored under <workspace_id>/ in a private bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('brand', 'brand', false, 5242880)
on conflict (id) do nothing;
create policy "see brand files" on storage.objects
  for select to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.view_workspace()::text and public.my_role() = 'designer');
create policy "add brand files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');
create policy "change brand files" on storage.objects
  for update to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');
create policy "remove brand files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = public.edit_workspace()::text and public.my_role() = 'designer');

-- AI drafting of line items: a daily allowance per workspace and across Oatcake.
create table if not exists public.ai_uses (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  what text not null,
  at timestamptz not null default now()
);
create index if not exists ai_uses_at_idx on public.ai_uses (at);
alter table public.ai_uses enable row level security;

create or replace function public.note_ai_use(what text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid := public.edit_workspace();
begin
  if ws is null or public.my_role() <> 'designer' then raise exception 'Only the workspace owner can do that'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and at > now() - interval '1 day') >= 40 then
    raise exception 'That''s the most AI drafts for today. You can still fill it in yourself.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1000 then
    raise exception 'AI drafting is busy today. You can still fill it in yourself.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, left(what, 40));
end $$;
revoke execute on function public.note_ai_use(text) from public, anon;
grant execute on function public.note_ai_use(text) to authenticated;
