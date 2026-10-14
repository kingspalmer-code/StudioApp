-- Clients use the apps made for their businesses: they see them, make backgrounds in them and
-- download them. Only the studio removes backgrounds, changes the pattern or deletes an app.

alter policy "see apps" on public.apps
  using (
    workspace_id = public.view_workspace() and (
      public.my_role() in ('designer', 'manager')
      or (public.my_role() = 'client' and business_id = any (public.my_businesses()))
    )
  );

create policy "clients add app backgrounds" on public.app_backgrounds
  for insert to authenticated
  with check (
    public.my_role() = 'client' and created_by = public.my_email()
    and exists (select 1 from public.apps a where a.id = app_id and a.workspace_id = public.edit_workspace()
                and a.business_id = any (public.my_businesses()))
  );

alter policy "see app files" on storage.objects
  using (
    bucket_id = 'apps' and exists (
      select 1 from public.apps a
      where a.id::text = (storage.foldername(objects.name))[2]
        and a.business_id::text = (storage.foldername(objects.name))[1]
        and a.workspace_id = public.view_workspace()
        and (public.my_role() in ('designer', 'manager')
             or (public.my_role() = 'client' and a.business_id = any (public.my_businesses())))
    )
  );

create policy "clients add app files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'apps' and public.my_role() = 'client'
    and exists (select 1 from public.apps a where a.id::text = (storage.foldername(objects.name))[2]
                and a.business_id::text = (storage.foldername(objects.name))[1]
                and a.workspace_id = public.edit_workspace() and a.business_id = any (public.my_businesses()))
  );
