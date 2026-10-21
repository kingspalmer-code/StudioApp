-- A business can pick the number its next invoice or quote carries, e.g. to carry on from
-- invoice 70 made outside Oatcake. Numbers still never go back over ones already used.
alter table public.doc_settings
  add column if not exists next_invoice int not null default 1 check (next_invoice between 1 and 9999999),
  add column if not exists next_quote int not null default 1 check (next_quote between 1 and 9999999);

create or replace function public.prepare_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare sub numeric := 0; item jsonb; start int;
begin
  if tg_op = 'INSERT' then
    select case when new.kind = 'invoice' then next_invoice else next_quote end into start
      from doc_settings where workspace_id = new.workspace_id;
    select greatest(coalesce(max(number), 0) + 1, coalesce(start, 1)) into new.number
      from documents where workspace_id = new.workspace_id and kind = new.kind;
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
