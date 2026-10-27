-- Add to Gallery (2026-10-27): the studio puts a picture (or any file) straight into the Gallery,
-- without a job, for one of its clients or its own business, and tags people on it. Tagged people
-- see it even if it isn't their business's, and hear about it in the bell, by email and on their
-- phone. The file sits in the deliveries bucket under <business_id>/gallery/, so the studio,
-- managers and that business's clients can open it under the rules that bucket already has.

create table if not exists public.gallery_items (
  id bigint generated always as identity primary key,
  workspace_id uuid not null default public.my_workspace() references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  path text not null unique,
  name text not null default '',
  mime text not null default '',
  size bigint not null default 0,
  caption text not null default '' check (length(caption) <= 1000),
  -- Emails of the people tagged on it: anyone with a login in the workspace.
  tagged text[] not null default '{}',
  added_by text not null default public.my_email(),
  created_at timestamptz not null default now()
);
create index if not exists gallery_items_workspace_idx on public.gallery_items (workspace_id, created_at desc);
create index if not exists gallery_items_tagged_idx on public.gallery_items using gin (tagged);
alter table public.gallery_items enable row level security;

-- Seen by the studio, managers and employees allowed to look at jobs, by the business's own clients,
-- and by anyone tagged on it.
drop policy if exists "gallery: see" on public.gallery_items;
create policy "gallery: see" on public.gallery_items for select to authenticated
  using (workspace_id = (select public.view_workspace()) and (
    (select public.my_role()) = 'manager'
    or (select public.can('requests', 'view'))
    or business_id = any ((select public.my_businesses())::uuid[])
    or (select public.my_email()) = any (tagged)
  ));
drop policy if exists "gallery: studio adds" on public.gallery_items;
create policy "gallery: studio adds" on public.gallery_items for insert to authenticated
  with check (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit'))
    and exists (select 1 from public.businesses b where b.id = business_id and b.workspace_id = (select public.edit_workspace())));
drop policy if exists "gallery: studio changes" on public.gallery_items;
create policy "gallery: studio changes" on public.gallery_items for update to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')))
  with check (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')));
drop policy if exists "gallery: studio removes" on public.gallery_items;
create policy "gallery: studio removes" on public.gallery_items for delete to authenticated
  using (workspace_id = (select public.edit_workspace()) and (select public.can('requests', 'edit')));

-- Someone tagged from another business (or an employee) can open the file and its preview.
drop policy if exists "gallery files: tagged read" on storage.objects;
create policy "gallery files: tagged read" on storage.objects for select to authenticated
  using (
    bucket_id = 'deliveries' and (storage.foldername(name))[2] = 'gallery'
    and exists (
      select 1 from public.gallery_items g
      where (g.path = objects.name or g.path || '.preview' = objects.name) and (select public.my_email()) = any (g.tagged)
    )
  );

-- Names for the tags. Clients can't read the workspace's people list, so this hands back just the
-- names of the people tagged on items the caller can see.
create or replace function public.gallery_tag_names(p_ids bigint[])
returns table (item_id bigint, email text, name text)
language sql stable security definer set search_path = public as $$
  select g.id, m.email, coalesce(nullif(m.full_name, ''), m.email)
  from gallery_items g
  cross join lateral unnest(g.tagged) as t(e)
  join members m on m.email = t.e
  where g.id = any (p_ids) and g.workspace_id = view_workspace() and (
    my_role() = 'manager' or can('requests', 'view') or g.business_id = any (my_businesses()) or my_email() = any (g.tagged)
  )
$$;
revoke execute on function public.gallery_tag_names(bigint[]) from public, anon;
grant execute on function public.gallery_tag_names(bigint[]) to authenticated;

-- The bell: "Kingsley tagged you in <caption>". Only people newly tagged are told, never yourself.
alter table public.notifications add column if not exists gallery_item_id bigint references public.gallery_items (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'request', 'follow_up', 'job', 'note', 'draft_note', 'approval', 'files', 'draft', 'review', 'finished',
  'task', 'task_note', 'task_signoff', 'task_confirmed', 'task_reopened',
  'plan', 'reminder', 'tagged'));

create or replace function public.notify_gallery_tag() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := public.my_email();
  who text;
  pic text;
  fresh text[];
begin
  if me = '' then return null; end if;
  fresh := array(
    select distinct e from unnest(new.tagged) e
    where e <> me and (tg_op = 'INSERT' or not e = any (old.tagged))
      and exists (select 1 from members m where m.email = e and m.workspace_id = new.workspace_id)
  );
  if cardinality(fresh) = 0 then return null; end if;
  select coalesce(nullif(full_name, ''), email) into who from members where email = me;
  select u.raw_user_meta_data ->> 'avatar_url' into pic from auth.users u where lower(u.email) = me limit 1;
  insert into notifications (recipient, gallery_item_id, kind, title, actor_email, actor_name, actor_avatar, body)
  select e, new.id, 'tagged', coalesce(nullif(left(new.caption, 80), ''), new.name, 'a picture'), me, coalesce(who, me), pic, left(new.caption, 400)
  from unnest(fresh) e;
  return null;
exception when others then
  raise warning 'notify_gallery_tag: %', sqlerrm;
  return null;
end $$;
create or replace trigger gallery_items_notify after insert or update of tagged on public.gallery_items
  for each row execute function public.notify_gallery_tag();
