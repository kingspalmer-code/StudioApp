-- Sign-up setup helper: someone describes their work, Claude suggests stages, job types and a job
-- form, they adjust it, and start_custom_workspace() saves it. Each suggestion is counted so one
-- person gets a few tries a day and Oatcake as a whole has a daily cap on what it spends.

create table if not exists public.setup_tries (
  id bigint generated always as identity primary key,
  email text not null,
  at timestamptz not null default now()
);
create index if not exists setup_tries_at_idx on public.setup_tries (at);
alter table public.setup_tries enable row level security;
-- No policies: only the functions below read or write it.

create or replace function public.note_setup_try() returns void
language plpgsql security definer set search_path = public as $$
declare e text := public.my_email();
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if (select count(*) from setup_tries where email = e and at > now() - interval '1 day') >= 5 then
    raise exception 'That''s the most tries for today. Start with a blank workspace instead.';
  end if;
  if (select count(*) from setup_tries where at > now() - interval '1 day') >= 300 then
    raise exception 'The setup helper is busy today. Start with a blank workspace instead.';
  end if;
  insert into setup_tries (email) values (e);
end $$;
revoke execute on function public.note_setup_try() from public, anon;
grant execute on function public.note_setup_try() to authenticated;

create or replace function public.setup_slug(t text) returns text
language sql immutable as $$
  select coalesce(nullif(left(trim(both '_' from regexp_replace(lower(t), '[^a-z0-9]+', '_', 'g')), 30), ''), 'x')
$$;

create or replace function public.start_custom_workspace(ws_name text, owner_name text, clients_log_in boolean, setup jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  e text := public.my_email();
  base text := coalesce(setup ->> 'base', 'personal');
  item jsonb;
  n int;
  k text;
  lbl text;
  f_use text;
  f_kind text;
  f_options text[];
  builtin_kinds jsonb := '{"formats":"text","brief":"longtext","copy":"longtext","links":"link","colours":"text",
    "event_date":"date","requester_name":"text","approver":"text","site_address":"address","quote_amount":"money",
    "paid_amount":"money","files":"files"}';
begin
  if e = '' then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where email = e) then raise exception 'You already have an Oatcake workspace'; end if;
  if length(trim(coalesce(ws_name, ''))) = 0 then raise exception 'Give your workspace a name'; end if;
  if jsonb_typeof(setup -> 'stages') <> 'array' or jsonb_array_length(setup -> 'stages') not between 2 and 8 then
    raise exception 'A workspace needs between 2 and 8 stages';
  end if;
  if jsonb_typeof(setup -> 'job_types') <> 'array' or jsonb_array_length(setup -> 'job_types') not between 1 and 12 then
    raise exception 'A workspace needs between 1 and 12 job types';
  end if;
  if base not in ('creative', 'photo', 'trades', 'events', 'content', 'personal') then base := 'personal'; end if;

  insert into workspaces (name, kind, owner_name, profile)
  values (left(trim(ws_name), 80), case when clients_log_in then 'studio' else 'trade' end,
          left(trim(coalesce(owner_name, '')), 80), base)
  returning id into ws;

  n := 0;
  for item in select * from jsonb_array_elements(setup -> 'stages') loop
    lbl := left(trim(coalesce(item ->> 'label', '')), 40);
    continue when lbl = '';
    k := setup_slug(lbl);
    if exists (select 1 from stages where workspace_id = ws and key = k) then k := k || '_' || n; end if;
    insert into stages (workspace_id, key, label, color, position)
    values (ws, k, lbl,
            case when item ->> 'color' in ('blue', 'indigo', 'purple', 'teal', 'orange', 'pink', 'red', 'green') then item ->> 'color' else 'blue' end,
            n);
    n := n + 1;
  end loop;
  if n < 2 then raise exception 'A workspace needs at least 2 stages'; end if;

  n := 0;
  for item in select * from jsonb_array_elements(setup -> 'job_types') loop
    lbl := left(trim(coalesce(item ->> 'name', '')), 50);
    continue when lbl = '';
    insert into job_types (workspace_id, name, lead_days, position)
    values (ws, lbl, least(365, greatest(0, coalesce((item ->> 'lead_days')::numeric, 3)::int)), n)
    on conflict (workspace_id, name) do nothing;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'A workspace needs at least 1 job type'; end if;

  n := 0;
  for item in select * from jsonb_array_elements(coalesce(setup -> 'fields', '[]')) limit 25 loop
    lbl := left(trim(coalesce(item ->> 'label', '')), 60);
    continue when lbl = '';
    f_use := coalesce(item ->> 'use', 'custom');
    if builtin_kinds ? f_use then
      perform add_job_field(ws, f_use, lbl, builtin_kinds ->> f_use, left(coalesce(item ->> 'hint', ''), 120),
                            coalesce((item ->> 'required')::boolean, false));
    else
      f_kind := item ->> 'kind';
      if f_kind is null or f_kind not in ('heading', 'text', 'longtext', 'number', 'money', 'date', 'select',
                                           'checkbox', 'link', 'address', 'phone', 'email') then f_kind := 'text'; end if;
      f_options := array(select left(trim(o), 40) from jsonb_array_elements_text(coalesce(item -> 'options', '[]')) o
                         where trim(o) <> '' limit 20);
      if f_kind = 'select' and coalesce(array_length(f_options, 1), 0) < 2 then f_kind := 'text'; end if;
      if f_kind <> 'select' then f_options := '{}'; end if;
      k := case when f_kind = 'heading' then 'h_' else 'f_' end || setup_slug(lbl);
      if exists (select 1 from job_fields where workspace_id = ws and key = k) then k := k || '_' || n; end if;
      perform add_job_field(ws, k, lbl, f_kind, left(coalesce(item ->> 'hint', ''), 120),
                            f_kind <> 'heading' and coalesce((item ->> 'required')::boolean, false), true, f_options);
    end if;
    n := n + 1;
  end loop;

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

  insert into members (email, full_name, role, workspace_id) values (e, left(trim(coalesce(owner_name, '')), 80), 'designer', ws);
  return ws;
end $$;
revoke execute on function public.start_custom_workspace(text, text, boolean, jsonb) from public, anon;
grant execute on function public.start_custom_workspace(text, text, boolean, jsonb) to authenticated;
