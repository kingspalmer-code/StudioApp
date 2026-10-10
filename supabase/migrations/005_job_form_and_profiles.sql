-- Job form: each workspace decides what a new job asks for. Built-in fields map to ticket
-- columns (they can be renamed, hidden, reordered and made required, but not deleted);
-- added fields keep their values in tickets.details. Hiding a field never removes saved values.
-- Starter profiles: a new workspace starts from one of six setups (stages, job types, form).
-- Policies are created fresh on the new table; nothing existing is removed.

alter table public.tickets add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.workspaces add column if not exists profile text not null default 'creative';

create table if not exists public.job_fields (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  kind text not null check (kind in ('heading', 'text', 'longtext', 'number', 'money', 'date', 'select',
                                     'checkbox', 'link', 'address', 'phone', 'email', 'files')),
  hint text not null default '',
  options text[] not null default '{}',
  required boolean not null default false,
  hidden boolean not null default false,
  on_form boolean not null default true,      -- false: only filled in on the job page
  type_ids bigint[] not null default '{}',     -- empty: every job type
  builtin boolean not null default false,
  position int not null default 0,
  unique (workspace_id, key)
);

create or replace function public.builtin_field_keys() returns text[]
language sql immutable as $$
  select array['formats', 'brief', 'copy', 'links', 'colours', 'event_date', 'requester_name', 'approver',
               'site_address', 'quote_amount', 'paid_amount', 'files']
$$;

-- Built-in fields keep their key and type. People can't add fields under built-in names; seeding can.
create or replace function public.guard_job_field() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.key := old.key;
    new.builtin := old.builtin;
    if old.builtin or old.kind = 'heading' then new.kind := old.kind; end if;
  elsif current_user in ('authenticated', 'anon') and new.key = any (public.builtin_field_keys()) then
    raise exception 'That field name is reserved';
  end if;
  if new.kind = 'files' and not new.builtin then raise exception 'Only the built-in files field can take uploads'; end if;
  return new;
end $$;
create or replace trigger guard_job_field before insert or update on public.job_fields
  for each row execute function public.guard_job_field();

alter table public.job_fields enable row level security;
create policy "see job fields" on public.job_fields
  for select to authenticated using (workspace_id = public.view_workspace());
create policy "owner adds job fields" on public.job_fields
  for insert to authenticated
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer' and not builtin);
create policy "owner edits job fields" on public.job_fields
  for update to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer')
  with check (workspace_id = public.edit_workspace() and public.my_role() = 'designer');
create policy "owner removes job fields" on public.job_fields
  for delete to authenticated
  using (workspace_id = public.edit_workspace() and public.my_role() = 'designer' and not builtin);

-- Seeding ------------------------------------------------------------------------
create or replace function public.add_job_field(ws uuid, f_key text, f_label text, f_kind text,
  f_hint text default '', f_required boolean default false, f_on_form boolean default true,
  f_options text[] default '{}', f_hidden boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into job_fields (workspace_id, key, label, kind, hint, required, on_form, options, hidden, builtin, position)
  values (ws, f_key, f_label, f_kind, f_hint, f_required, f_on_form, f_options, f_hidden,
          f_key = any (builtin_field_keys()),
          coalesce((select max(position) + 1 from job_fields where workspace_id = ws), 0))
  on conflict (workspace_id, key) do nothing;
end $$;

create or replace function public.seed_fields(ws uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p = 'trades' then
    perform add_job_field(ws, 'formats', 'Size / measurements', 'text', '2400 × 600mm, double-sided');
    perform add_job_field(ws, 'brief', 'Job notes', 'longtext', 'Wording, colours, materials, fixings');
    perform add_job_field(ws, 'site_address', 'Site address', 'address', 'Where the job is');
    perform add_job_field(ws, 'quote_amount', 'Quote (£)', 'money', 'Leave blank if not quoted yet');
    perform add_job_field(ws, 'paid_amount', 'Paid (£)', 'money', '', false, false);
    perform add_job_field(ws, 'files', 'Photos / drawings', 'files');
  elsif p = 'photo' then
    perform add_job_field(ws, 'event_date', 'Shoot date', 'date');
    perform add_job_field(ws, 'site_address', 'Location', 'address', 'Where the shoot is');
    perform add_job_field(ws, 'brief', 'Brief', 'longtext', 'What it''s for, the look and feel');
    perform add_job_field(ws, 'copy', 'Shot list', 'longtext', 'Must-have shots, people, products');
    perform add_job_field(ws, 'formats', 'Deliverables', 'text', 'e.g. 40 edited images, 60-second reel');
    perform add_job_field(ws, 'quote_amount', 'Fee (£)', 'money');
    perform add_job_field(ws, 'paid_amount', 'Deposit paid (£)', 'money', '', false, false);
    perform add_job_field(ws, 'files', 'Reference images', 'files');
  elsif p = 'events' then
    perform add_job_field(ws, 'event_date', 'Event date', 'date', '', true);
    perform add_job_field(ws, 'site_address', 'Venue', 'address');
    perform add_job_field(ws, 'brief', 'Plan', 'longtext', 'What''s happening and who it''s for');
    perform add_job_field(ws, 'suppliers', 'Suppliers', 'longtext', 'Bands, DJs, caterers, hire');
    perform add_job_field(ws, 'quote_amount', 'Budget (£)', 'money');
    perform add_job_field(ws, 'artwork', 'Artwork needed', 'checkbox');
    perform add_job_field(ws, 'files', 'Files', 'files');
  elsif p = 'content' then
    perform add_job_field(ws, 'channel', 'Channel', 'select', '', false, true,
      array['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Email', 'Website']);
    perform add_job_field(ws, 'event_date', 'Publish date', 'date');
    perform add_job_field(ws, 'brief', 'Idea', 'longtext', 'The angle and the hook');
    perform add_job_field(ws, 'copy', 'Copy', 'longtext', 'Caption or text as it should go out');
    perform add_job_field(ws, 'links', 'Links', 'link');
    perform add_job_field(ws, 'files', 'Assets', 'files');
    perform add_job_field(ws, 'approver', 'Approver', 'text', 'Who signs it off');
  elsif p = 'personal' then
    perform add_job_field(ws, 'brief', 'Notes', 'longtext');
    perform add_job_field(ws, 'links', 'Links', 'link');
    perform add_job_field(ws, 'files', 'Files', 'files');
  else -- creative
    perform add_job_field(ws, 'formats', 'Sizes / formats', 'text', 'A3 print, IG post 1080×1350, story');
    perform add_job_field(ws, 'brief', 'What do you need?', 'longtext', 'Goal, audience, where it will be used', true);
    perform add_job_field(ws, 'h_copy', 'Copy', 'heading');
    perform add_job_field(ws, 'copy', 'Exact wording to use', 'longtext',
      'Headline, dates, prices, small print. Paste it exactly as it should appear.');
    perform add_job_field(ws, 'h_inspiration', 'Inspiration', 'heading');
    perform add_job_field(ws, 'links', 'Links', 'link', 'Pinterest, Instagram, websites');
    perform add_job_field(ws, 'files', 'Images / logos', 'files');
    perform add_job_field(ws, 'colours', 'Colours / mood', 'text', 'Autumnal, gold and black, playful');
    perform add_job_field(ws, 'event_date', 'Event / go-live', 'date');
    perform add_job_field(ws, 'h_signoff', 'Sign-off', 'heading');
    perform add_job_field(ws, 'requester_name', 'Requested by', 'text', 'Who should we ask?', true);
    perform add_job_field(ws, 'approver', 'Final approver', 'text', 'If someone else signs it off');
  end if;
  -- Every other built-in field is there too, switched off, ready to turn on.
  perform add_job_field(ws, 'formats', 'Sizes / formats', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'brief', 'Notes', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'copy', 'Exact wording', 'longtext', '', false, true, '{}', true);
  perform add_job_field(ws, 'links', 'Links', 'link', '', false, true, '{}', true);
  perform add_job_field(ws, 'colours', 'Colours / mood', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'event_date', 'Event date', 'date', '', false, true, '{}', true);
  perform add_job_field(ws, 'site_address', 'Address', 'address', '', false, true, '{}', true);
  perform add_job_field(ws, 'quote_amount', 'Quote (£)', 'money', '', false, true, '{}', true);
  perform add_job_field(ws, 'paid_amount', 'Paid (£)', 'money', '', false, false, '{}', true);
  perform add_job_field(ws, 'files', 'Files', 'files', '', false, true, '{}', true);
  perform add_job_field(ws, 'requester_name', 'Requested by', 'text', '', false, true, '{}', true);
  perform add_job_field(ws, 'approver', 'Approver', 'text', '', false, true, '{}', true);
end $$;

create or replace function public.seed_profile(ws uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p = 'trades' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'quote', 'Quote sent', 'orange', 0), (ws, 'paid', 'Quote paid', 'teal', 1), (ws, 'design', 'Design', 'blue', 2),
      (ws, 'build', 'Building', 'purple', 3), (ws, 'done', 'Finished', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Shop fascia', 10, 0), (ws, 'Van livery', 5, 1), (ws, 'Hand lettering', 3, 2),
      (ws, 'A-board', 3, 3), (ws, 'Window vinyl', 2, 4), (ws, 'Other', 3, 5);
  elsif p = 'photo' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'enquiry', 'Enquiry', 'blue', 0), (ws, 'booked', 'Booked', 'indigo', 1), (ws, 'shoot', 'Shoot', 'purple', 2),
      (ws, 'editing', 'Editing', 'orange', 3), (ws, 'delivered', 'Delivered', 'teal', 4), (ws, 'done', 'Paid', 'green', 5);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Portrait', 5, 0), (ws, 'Event', 7, 1), (ws, 'Product', 5, 2), (ws, 'Wedding', 20, 3),
      (ws, 'Video', 10, 4), (ws, 'Other', 5, 5);
  elsif p = 'events' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'idea', 'Idea', 'blue', 0), (ws, 'planning', 'Planning', 'indigo', 1), (ws, 'promoting', 'Promoting', 'purple', 2),
      (ws, 'eventday', 'Event day', 'orange', 3), (ws, 'done', 'Wrapped up', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Live music', 14, 0), (ws, 'Quiz or theme night', 7, 1), (ws, 'Private hire', 10, 2),
      (ws, 'Festival', 30, 3), (ws, 'Other', 7, 4);
  elsif p = 'content' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'ideas', 'Ideas', 'blue', 0), (ws, 'drafting', 'Drafting', 'indigo', 1), (ws, 'review', 'In review', 'purple', 2),
      (ws, 'scheduled', 'Scheduled', 'orange', 3), (ws, 'done', 'Published', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Social post', 2, 0), (ws, 'Reel or video', 4, 1), (ws, 'Blog or article', 5, 2),
      (ws, 'Newsletter', 3, 3), (ws, 'Campaign', 10, 4), (ws, 'Other', 3, 5);
  elsif p = 'personal' then
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'todo', 'To do', 'blue', 0), (ws, 'doing', 'Doing', 'orange', 1), (ws, 'done', 'Done', 'green', 2);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Task', 1, 0), (ws, 'Project', 5, 1), (ws, 'Errand', 1, 2);
  else -- creative
    insert into stages (workspace_id, key, label, color, position) values
      (ws, 'new', 'New', 'blue', 0), (ws, 'progress', 'In progress', 'indigo', 1), (ws, 'review', 'With client', 'purple', 2),
      (ws, 'waiting', 'Waiting on client', 'orange', 3), (ws, 'done', 'Delivered', 'green', 4);
    insert into job_types (workspace_id, name, lead_days, position) values
      (ws, 'Poster', 5, 0), (ws, 'Social media', 2, 1), (ws, 'Menu', 5, 2), (ws, 'Merch', 10, 3),
      (ws, 'Website', 12, 4), (ws, 'Photoshoot', 4, 5), (ws, 'Other', 3, 6);
  end if;
  perform seed_fields(ws, p);
end $$;

-- Admin-created workspaces use the matching profile.
create or replace function public.seed_workspace(ws uuid, ws_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare p text := case when ws_kind = 'trade' then 'trades' else 'creative' end;
begin
  update workspaces set profile = p where id = ws;
  perform seed_profile(ws, p);
end $$;

revoke execute on function public.add_job_field(uuid, text, text, text, text, boolean, boolean, text[], boolean) from public, anon, authenticated;
revoke execute on function public.seed_fields(uuid, text) from public, anon, authenticated;
revoke execute on function public.seed_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.seed_workspace(uuid, text) from public, anon, authenticated;

-- Existing workspaces get the form that matches what they have today.
update public.workspaces set profile = case when kind = 'trade' then 'trades' else 'creative' end;
do $$
declare w record;
begin
  for w in select id, profile from public.workspaces where not exists (select 1 from public.job_fields f where f.workspace_id = workspaces.id) loop
    perform public.seed_fields(w.id, w.profile);
  end loop;
end $$;

-- Self sign-up ------------------------------------------------------------------
-- Anyone signed in without a workspace can start one. Clients logging in means a studio-style
-- workspace (requests from businesses); otherwise it's just them (jobs for customers).
create or replace function public.start_workspace(ws_name text, owner_name text, ws_profile text, clients_log_in boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid; e text := public.my_email();
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if ws_profile not in ('creative', 'photo', 'trades', 'events', 'content', 'personal') then raise exception 'Pick what you do'; end if;
  if length(trim(coalesce(ws_name, ''))) = 0 then raise exception 'Give your workspace a name'; end if;
  insert into workspaces (name, kind, owner_name, profile)
  values (left(trim(ws_name), 80), case when clients_log_in then 'studio' else 'trade' end,
          left(trim(coalesce(owner_name, '')), 80), ws_profile)
  returning id into ws;
  perform seed_profile(ws, ws_profile);
  insert into members (email, full_name, role, workspace_id) values (e, left(trim(coalesce(owner_name, '')), 80), 'designer', ws);
  return ws;
end $$;
revoke execute on function public.start_workspace(text, text, text, boolean) from public, anon;
grant execute on function public.start_workspace(text, text, text, boolean) to authenticated;
