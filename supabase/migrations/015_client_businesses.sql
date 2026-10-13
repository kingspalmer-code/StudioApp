-- Clients who request work for more than one business. A client keeps their main business
-- (members.business_id, which themes their portal) and can be given others here. Everywhere a
-- client was limited to their own business, they're now limited to any of theirs.

create table if not exists public.member_businesses (
  email text not null references public.members (email) on delete cascade on update cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (email, business_id)
);
create index if not exists member_businesses_business on public.member_businesses (business_id);
alter table public.member_businesses enable row level security;

-- The extra business must be in the same workspace as the person.
create or replace function public.check_member_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from members m join businesses b on b.workspace_id = m.workspace_id
    where m.email = new.email and b.id = new.business_id
  ) then
    raise exception 'That business is not in this workspace';
  end if;
  return new;
end $$;
create or replace trigger member_businesses_check before insert or update on public.member_businesses
  for each row execute function public.check_member_business();

-- Every business the signed-in person can request work for: their main one plus any extras.
create or replace function public.my_businesses() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct id), '{}') from (
    select business_id as id from members where email = public.my_email() and business_id is not null
    union
    select business_id from member_businesses where email = public.my_email()
  ) x
$$;
revoke execute on function public.my_businesses() from public, anon;
grant execute on function public.my_businesses() to authenticated;

create policy "member businesses: see" on public.member_businesses
  for select to authenticated using (
    email = public.my_email()
    or (public.my_role() in ('designer', 'manager')
      and exists (select 1 from public.businesses b where b.id = business_id and b.workspace_id = public.view_workspace()))
  );
create policy "member businesses: studio manages" on public.member_businesses
  for all to authenticated
  using (public.my_role() = 'designer'
    and exists (select 1 from public.businesses b where b.id = business_id and b.workspace_id = public.edit_workspace()))
  with check (public.my_role() = 'designer'
    and exists (select 1 from public.businesses b where b.id = business_id and b.workspace_id = public.edit_workspace()));

-- Jobs and files: any of the client's businesses, not just the main one.
alter policy "see tickets" on public.tickets
  using (
    workspace_id = public.view_workspace() and (
      public.my_role() in ('designer', 'manager')
      or (public.my_role() = 'client' and business_id = any (public.my_businesses()))
    )
  );
alter policy "submit tickets" on public.tickets
  with check (
    workspace_id = public.edit_workspace() and (
      public.my_role() = 'designer'
      or (public.my_role() = 'client' and business_id = any (public.my_businesses())
          and status = public.first_stage(workspace_id) and pinned = false and created_by = public.my_email())
    )
  );

alter policy "read inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and (
      public.is_platform_admin()
      or (public.my_role() in ('designer', 'manager')
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (storage.foldername(name))[1] = any (public.my_businesses()::text[])
    )
  );
alter policy "upload inspiration" on storage.objects
  with check (
    bucket_id = 'inspiration' and (
      (public.my_role() = 'designer'
        and exists (select 1 from public.businesses b
          where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
      or (public.my_role() = 'client' and (storage.foldername(name))[1] = any (public.my_businesses()::text[]))
    )
  );
alter policy "deliveries files: read" on storage.objects
  using (
    bucket_id = 'deliveries' and (
      public.is_platform_admin()
      or (public.my_role() in ('designer', 'manager')
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (storage.foldername(name))[1] = any (public.my_businesses()::text[])
    )
  );
alter policy "brand logos: the business or its studio uploads" on storage.objects
  with check (
    bucket_id = 'brand-logos' and (
      (public.my_role() = 'client' and (storage.foldername(name))[1] = any (public.my_businesses()::text[]))
      or (public.my_role() = 'designer' and exists (select 1 from public.businesses b
        where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
    )
  );

create or replace function public.set_business_brand(p_business uuid, p_logo text, p_accent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    (my_role() = 'client' and p_business = any (my_businesses()) and edit_workspace() is not null)
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
