-- Personal to-dos and projects for the designer. Only the person who owns a row can see it.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.personal_projects (
  id bigint generated always as identity primary key,
  owner_email text not null default public.my_email(),
  name text not null check (length(trim(name)) > 0),
  color text not null default '#382a25',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_tasks (
  id bigint generated always as identity primary key,
  owner_email text not null default public.my_email(),
  project_id bigint references public.personal_projects (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  due date,
  flagged boolean not null default false,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists personal_tasks_owner_idx on public.personal_tasks (owner_email, done, due);

create or replace function public.touch_personal_task() returns trigger
language plpgsql as $$
begin
  if new.done and not old.done then new.done_at = now(); end if;
  if not new.done then new.done_at = null; end if;
  return new;
end $$;

drop trigger if exists personal_tasks_touch on public.personal_tasks;
create trigger personal_tasks_touch before update on public.personal_tasks
  for each row execute function public.touch_personal_task();

alter table public.personal_projects enable row level security;
alter table public.personal_tasks enable row level security;

drop policy if exists "own projects" on public.personal_projects;
create policy "own projects" on public.personal_projects
  for all to authenticated
  using (owner_email = public.my_email() and public.my_role() = 'designer')
  with check (owner_email = public.my_email() and public.my_role() = 'designer');

drop policy if exists "own tasks" on public.personal_tasks;
create policy "own tasks" on public.personal_tasks
  for all to authenticated
  using (owner_email = public.my_email() and public.my_role() = 'designer')
  with check (
    owner_email = public.my_email() and public.my_role() = 'designer'
    and (project_id is null or exists (select 1 from public.personal_projects p where p.id = project_id))
  );
