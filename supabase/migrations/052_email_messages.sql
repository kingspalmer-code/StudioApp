-- A business can write the email that goes with its quotes and invoices ("Dear {first name}, ...").
-- Empty means Oatcake's own wording.
alter table public.doc_settings
  add column if not exists quote_message text not null default '' check (char_length(quote_message) <= 2000),
  add column if not exists invoice_message text not null default '' check (char_length(invoice_message) <= 2000);
