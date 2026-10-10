-- Oatcake admins can look inside any workspace, read-only. The app sends the workspace to view
-- in an x-oatcake-workspace request header; it only counts for platform admins. Reads follow
-- view_workspace(); every write follows edit_workspace(), which is empty while viewing someone
-- else's workspace, so nothing can be changed there. No DROP statements, policies altered in place.

create or replace function public.view_workspace() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
  w uuid;
begin
  if public.is_platform_admin() then
    v := nullif(current_setting('request.headers', true), '')::json ->> 'x-oatcake-workspace';
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into w from workspaces where id = v::uuid;
      if w is not null then
        return w;
      end if;
    end if;
  end if;
  return public.my_workspace();
end $$;

create or replace function public.edit_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select case when public.view_workspace() = public.my_workspace() then public.my_workspace() end
$$;

grant execute on function public.view_workspace() to authenticated;
grant execute on function public.edit_workspace() to authenticated;

-- Reads
alter policy "see stages" on public.stages using (workspace_id = public.view_workspace());
alter policy "see job types" on public.job_types using (workspace_id = public.view_workspace());
alter policy "members read businesses" on public.businesses using (workspace_id = public.view_workspace());
alter policy "read own member row" on public.members
  using (email = public.my_email() or (workspace_id = public.view_workspace() and public.my_role() in ('designer', 'manager')));
alter policy "see tickets" on public.tickets
  using (
    workspace_id = public.view_workspace() and (
      public.my_role() in ('designer', 'manager')
      or (public.my_role() = 'client' and business_id = public.my_business())
    )
  );
alter policy "read inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and (
      public.is_platform_admin()
      or (public.my_role() in ('designer', 'manager')
        and exists (select 1 from public.businesses b where b.id::text = (storage.foldername(objects.name))[1]))
      or (storage.foldername(name))[1] = public.my_business()::text
    )
  );

-- Writes (the "manages" policies cover select too, so they must not leak the owner's own rows while viewing)
alter policy "owner manages stages" on public.stages
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner manages job types" on public.job_types
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner manages businesses" on public.businesses
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "designer manages members" on public.members
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "owner renames workspace" on public.workspaces
  using (id = public.edit_workspace() and public.my_role() = 'designer')
  with check (id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "submit tickets" on public.tickets
  with check (
    workspace_id = public.edit_workspace() and (
      public.my_role() = 'designer'
      or (public.my_role() = 'client' and business_id = public.my_business()
          and status = public.first_stage(workspace_id) and pinned = false and created_by = public.my_email())
    )
  );
alter policy "designer updates tickets" on public.tickets
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "designer deletes tickets" on public.tickets
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
alter policy "add files" on public.ticket_files
  with check (
    public.my_role() in ('designer', 'client')
    and exists (select 1 from public.tickets t where t.id = ticket_files.ticket_id and t.workspace_id = public.edit_workspace())
  );
alter policy "add notes" on public.ticket_notes
  with check (
    public.my_role() in ('designer', 'client') and author_email = public.my_email()
    and exists (select 1 from public.tickets t where t.id = ticket_notes.ticket_id and t.workspace_id = public.edit_workspace())
  );
alter policy "upload inspiration" on storage.objects
  with check (
    bucket_id = 'inspiration' and (
      (public.my_role() = 'designer'
        and exists (select 1 from public.businesses b
          where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace()))
      or (public.my_role() = 'client' and (storage.foldername(name))[1] = public.my_business()::text)
    )
  );
alter policy "designer removes inspiration" on storage.objects
  using (
    bucket_id = 'inspiration' and public.my_role() = 'designer'
    and exists (select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1] and b.workspace_id = public.edit_workspace())
  );
