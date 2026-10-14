-- Apps: small tools the studio makes for one client business, under Apps in the menu. The first
-- kind is a pattern app: a line pattern (an SVG) that can be recoloured, with the pattern and the
-- background set separately, and saved to that app's gallery of backgrounds.
-- The studio makes and uses them; managers can look and download.

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'pattern' check (kind in ('pattern')),
  name text not null check (length(trim(name)) between 1 and 80),
  -- Pattern apps: the source SVG in the apps bucket (<business id>/<app id>/pattern.svg).
  source_path text,
  -- The part of the pattern each background shows ({x, y, w, h} in the SVG's units), saved at one
  -- pixel per unit. Empty means the whole drawing.
  frame jsonb,
  created_at timestamptz not null default now()
);
create index if not exists apps_business on public.apps (business_id);
alter table public.apps enable row level security;

create table if not exists public.app_backgrounds (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  name text not null default '' check (length(name) <= 80),
  pattern_color text not null check (pattern_color ~ '^#[0-9a-f]{6}$'),
  background_color text not null check (background_color ~ '^#[0-9a-f]{6}$'),
  -- In the apps bucket under the app's folder: the full-size JPG, a small one for the gallery, and the SVG.
  image_path text not null,
  thumb_path text not null,
  svg_path text not null,
  created_by text not null default public.my_email(),
  created_at timestamptz not null default now()
);
create index if not exists app_backgrounds_app on public.app_backgrounds (app_id, created_at desc);
alter table public.app_backgrounds enable row level security;

create policy "see apps" on public.apps
  for select to authenticated
  using (workspace_id = public.view_workspace() and public.my_role() in ('designer', 'manager'));
create policy "studio manages apps" on public.apps
  for all to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (
    workspace_id = public.edit_workspace() and public.my_role() = 'designer'
    and exists (select 1 from public.businesses b where b.id = business_id and b.workspace_id = public.edit_workspace())
  );

create policy "see app backgrounds" on public.app_backgrounds
  for select to authenticated
  using (exists (select 1 from public.apps a where a.id = app_id));
create policy "studio manages app backgrounds" on public.app_backgrounds
  for all to authenticated
  using (public.my_role() = 'designer' and exists (select 1 from public.apps a where a.id = app_id and a.workspace_id = public.edit_workspace()))
  with check (public.my_role() = 'designer' and exists (select 1 from public.apps a where a.id = app_id and a.workspace_id = public.edit_workspace()));

-- Files, under <business id>/<app id>/ in a private bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('apps', 'apps', false, 26214400)
on conflict (id) do nothing;

create policy "see app files" on storage.objects
  for select to authenticated
  using (bucket_id = 'apps' and public.my_role() in ('designer', 'manager')
    and exists (select 1 from public.apps a where a.id::text = (storage.foldername(objects.name))[2]
                and a.business_id::text = (storage.foldername(objects.name))[1] and a.workspace_id = public.view_workspace()));
create policy "add app files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'apps' and public.my_role() = 'designer'
    and exists (select 1 from public.apps a where a.id::text = (storage.foldername(objects.name))[2]
                and a.business_id::text = (storage.foldername(objects.name))[1] and a.workspace_id = public.edit_workspace()));
create policy "change app files" on storage.objects
  for update to authenticated
  using (bucket_id = 'apps' and public.my_role() = 'designer'
    and exists (select 1 from public.apps a where a.id::text = (storage.foldername(objects.name))[2]
                and a.business_id::text = (storage.foldername(objects.name))[1] and a.workspace_id = public.edit_workspace()));
create policy "remove app files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'apps' and public.my_role() = 'designer'
    and exists (select 1 from public.apps a where a.id::text = (storage.foldername(objects.name))[2]
                and a.business_id::text = (storage.foldername(objects.name))[1] and a.workspace_id = public.edit_workspace()));
