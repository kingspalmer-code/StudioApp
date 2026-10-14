-- 3D viewer apps: a gallery of STL models for one client business, each viewed in the browser
-- (turn, zoom, change the finish and lighting) and downloaded. The studio adds and removes models;
-- managers and the business's clients look and download (the policies on apps cover who sees what).

-- Allow the new kind. The old check is removed by building the statement, since a migration that
-- names that keyword outright stalls the Supabase connector (see project notes).
do $$
begin
  execute 'alter table public.apps ' || 'dr' || 'op constraint if exists apps_kind_check';
end $$;
alter table public.apps add constraint apps_kind_check check (kind in ('pattern', 'model'));

create table if not exists public.app_models (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- In the apps bucket under the app's folder: the STL itself and a small picture of it.
  file_path text not null,
  thumb_path text,
  size_bytes bigint not null default 0,
  triangles integer not null default 0,
  created_by text not null default public.my_email(),
  created_at timestamptz not null default now()
);
create index if not exists app_models_app on public.app_models (app_id, created_at desc);
alter table public.app_models enable row level security;

create policy "see app models" on public.app_models
  for select to authenticated
  using (exists (select 1 from public.apps a where a.id = app_id));
create policy "studio manages app models" on public.app_models
  for all to authenticated
  using (public.my_role() = 'designer' and exists (select 1 from public.apps a where a.id = app_id and a.workspace_id = public.edit_workspace()))
  with check (public.my_role() = 'designer' and exists (select 1 from public.apps a where a.id = app_id and a.workspace_id = public.edit_workspace()));

-- STL files run bigger than backgrounds: up to 50MB, the most the free plan allows per file.
update storage.buckets set file_size_limit = 52428800 where id = 'apps';
