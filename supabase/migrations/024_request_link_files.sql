-- Photos and files on the request link. People sending a job through a workspace's request link
-- aren't signed in, so they get a narrow exception: for 15 minutes after sending, they can add up
-- to 10 files under that one job's folder (<business id>/<job id>/...) in the inspiration bucket.

create or replace function public.link_upload_ok(path text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select exists (
    select 1 from tickets t
    where t.id::text = (storage.foldername(path))[2]
      and t.business_id::text = (storage.foldername(path))[1]
      and t.details ? 'via_link'
      and t.created_at > now() - interval '15 minutes'
  ) and (select count(*) from storage.objects o
         where o.bucket_id = 'inspiration' and (storage.foldername(o.name))[1] = (storage.foldername(path))[1]
           and (storage.foldername(o.name))[2] = (storage.foldername(path))[2]) < 10
$$;
grant execute on function public.link_upload_ok(text) to anon, authenticated;

create policy "request link uploads" on storage.objects for insert to anon
  with check (bucket_id = 'inspiration' and public.link_upload_ok(name));

-- Where a just-sent request's files go, for the request form to upload to.
create or replace function public.link_upload_folder(p_ticket bigint)
returns text language sql stable security definer set search_path = public as $$
  select t.business_id::text || '/' || t.id::text from tickets t
  where t.id = p_ticket and t.details ? 'via_link' and t.created_at > now() - interval '15 minutes'
$$;

-- Records an uploaded file on the job, once it's really in storage under that job's folder.
create or replace function public.attach_link_file(p_ticket bigint, p_path text, p_name text)
returns void language plpgsql security definer set search_path = public, storage as $$
declare folder text := public.link_upload_folder(p_ticket);
begin
  if folder is null or p_path not like folder || '/%' then raise exception 'Too late to add files to that request'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'inspiration' and name = p_path) then raise exception 'That file didn''t upload'; end if;
  if exists (select 1 from ticket_files where ticket_id = p_ticket and path = p_path) then return; end if;
  insert into ticket_files (ticket_id, path, name) values (p_ticket, p_path, left(coalesce(nullif(trim(p_name), ''), 'File'), 200));
end $$;

revoke execute on function public.link_upload_folder(bigint) from public;
revoke execute on function public.attach_link_file(bigint, text, text) from public;
grant execute on function public.link_upload_folder(bigint) to anon, authenticated;
grant execute on function public.attach_link_file(bigint, text, text) to anon, authenticated;

-- The request form now shows the workspace's own file question too.
create or replace function public.request_form(slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', w.name,
    'owner_name', w.owner_name,
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'lead_days', t.lead_days) order by t.position, t.id)
                       from job_types t where t.workspace_id = w.id), '[]'),
    'fields', coalesce((select jsonb_agg(to_jsonb(f) - 'workspace_id' order by f.position, f.id)
                        from job_fields f where f.workspace_id = w.id and f.on_form and not f.hidden
                          and f.key not in ('quote_amount', 'paid_amount', 'requester_name', 'approver')), '[]'))
  from workspaces w
  where w.request_slug = lower(slug) and w.requests_open and w.kind = 'trade'
$$;
