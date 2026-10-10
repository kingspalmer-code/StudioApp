-- Client portal: finished files delivered on a job, businesses setting their own logo and
-- colour, and a daily limit for the brief helper on requests.

-- Finished files ("deliveries") the studio adds to a job when it's done. Either a file in the
-- private 'deliveries' bucket (under <business_id>/<ticket_id>/) or a link to one hosted elsewhere.
create table if not exists public.ticket_deliveries (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id) on delete cascade,
  path text,
  url text,
  name text not null check (length(trim(name)) > 0),
  size bigint not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now(),
  check ((path is null) <> (url is null))
);
create index if not exists ticket_deliveries_ticket on public.ticket_deliveries (ticket_id);
alter table public.ticket_deliveries enable row level security;

-- Anyone who can see the job can see its finished files; only the studio adds or removes them.
create policy "deliveries: see with the job" on public.ticket_deliveries
  for select to authenticated using (exists (select 1 from public.tickets t where t.id = ticket_id));
create policy "deliveries: studio adds" on public.ticket_deliveries
  for insert to authenticated with check (
    public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace())
  );
create policy "deliveries: studio removes" on public.ticket_deliveries
  for delete to authenticated using (
    public.my_role() = 'designer'
    and exists (select 1 from public.tickets t where t.id = ticket_id and t.workspace_id = public.edit_workspace())
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('deliveries', 'deliveries', false, 52428800)
on conflict (id) do nothing;

create policy "deliveries files: read" on storage.objects for select to authenticated using (
  bucket_id = 'deliveries' and (
    public.is_platform_admin()
    or (public.my_role() in ('designer', 'manager')
      and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
    or (storage.foldername(name))[1] = public.my_business()::text
  )
);
create policy "deliveries files: studio uploads" on storage.objects for insert to authenticated with check (
  bucket_id = 'deliveries' and public.my_role() = 'designer'
  and exists (select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace())
);
create policy "deliveries files: studio removes" on storage.objects for delete to authenticated using (
  bucket_id = 'deliveries' and public.my_role() = 'designer'
  and exists (select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace())
);

-- A business's own logo and colour, which theme its portal. Null means the default.
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists accent text check (accent is null or accent ~* '^#[0-9a-f]{6}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-logos', 'brand-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "brand logos: the business or its studio uploads" on storage.objects for insert to authenticated with check (
  bucket_id = 'brand-logos' and (
    (public.my_role() = 'client' and (storage.foldername(name))[1] = public.my_business()::text)
    or (public.my_role() = 'designer' and exists (select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
  )
);

-- Staff at a business can change its logo and colour; so can the studio. Nothing else about it.
create or replace function public.set_business_brand(p_business uuid, p_logo text, p_accent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    (my_role() = 'client' and p_business = my_business() and edit_workspace() is not null)
    or (my_role() = 'designer' and exists (select 1 from businesses b where b.id = p_business and b.workspace_id = edit_workspace()))
  ) then
    raise exception 'You can only change your own business.';
  end if;
  if p_accent is not null and p_accent !~* '^#[0-9a-f]{6}$' then raise exception 'Pick a colour.'; end if;
  if p_logo is not null and p_logo <> '' and p_logo !~ '^https://[^ ]+/storage/v1/object/public/brand-logos/' then
    raise exception 'Upload the logo first.';
  end if;
  update businesses set logo_url = nullif(p_logo, ''), accent = p_accent where id = p_business;
end $$;
revoke execute on function public.set_business_brand(uuid, text, text) from public, anon;
grant execute on function public.set_business_brand(uuid, text, text) to authenticated;

-- The brief helper on requests: 15 a day for each business, plus the overall daily cap.
create or replace function public.note_brief_help() returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := public.edit_workspace();
  who text := coalesce(public.my_business()::text, public.my_email());
begin
  if ws is null or public.my_role() not in ('client', 'designer') then raise exception 'Sign in to your portal first.'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and what = 'ask-brief:' || who and at > now() - interval '1 day') >= 15 then
    raise exception 'That''s all the brief help for today. You can still send the request as it is.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1500 then
    raise exception 'Oatcake is busy today. You can still send the request as it is.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, 'ask-brief:' || who);
end $$;
revoke execute on function public.note_brief_help() from public, anon;
grant execute on function public.note_brief_help() to authenticated;
