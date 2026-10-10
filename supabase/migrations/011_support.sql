-- Help & support: anyone signed in can message Oatcake, and Oatcake admins answer from Admin → Support.
-- Each conversation is a support ticket with its messages. People see their own; admins see all.
-- Every change goes through the functions below, so the rules live in one place.
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  email text not null default public.my_email(),
  name text not null default '',
  workspace_id uuid references public.workspaces (id) on delete set null,
  subject text not null default '',
  status text not null default 'open' check (status in ('open', 'waiting', 'solved')),
  page text not null default '',
  device text not null default '',
  last_from text not null default 'user' check (last_from in ('user', 'oatcake')),
  user_seen_at timestamptz not null default now(),
  admin_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status on public.support_tickets (status, updated_at desc);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets (id) on delete cascade,
  from_oatcake boolean not null default false,
  author_name text not null default '',
  body text not null default '' check (length(body) <= 6000),
  attachment text,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy "support: see your own, admins see all" on public.support_tickets
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "support: see messages on tickets you can see" on public.support_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.is_platform_admin()))
  );

-- Screenshots people attach: private, in a folder per person. Admins can read them all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "support files: add your own" on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "support files: see your own, admins see all" on storage.objects for select to authenticated
  using (bucket_id = 'support' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));
-- Screenshots Oatcake attaches in a reply can be seen by the person the conversation belongs to.
create policy "support files: see files on your conversations" on storage.objects for select to authenticated
  using (bucket_id = 'support' and exists (
    select 1 from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
    where m.attachment = storage.objects.name and t.user_id = auth.uid()
  ));

-- Start a conversation. A few a day each is plenty, and stops a stuck script flooding the inbox.
create or replace function public.support_open(p_subject text, p_body text, p_page text, p_device text, p_attachment text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  t_id bigint;
  who public.members%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first.'; end if;
  if (select count(*) from support_tickets where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of messages today. Reply on an earlier one and we''ll pick it up.';
  end if;
  select * into who from members where email = my_email();
  insert into support_tickets (user_id, email, name, workspace_id, subject, page, device)
  values (auth.uid(), my_email(), coalesce(who.full_name, ''), who.workspace_id,
          left(trim(coalesce(p_subject, '')), 140), left(coalesce(p_page, ''), 300), left(coalesce(p_device, ''), 300))
  returning id into t_id;
  insert into support_messages (ticket_id, author_name, body, attachment)
  values (t_id, coalesce(who.full_name, ''), left(trim(p_body), 6000), nullif(p_attachment, ''));
  return t_id;
end $$;

-- Add a message. Admins answering pass as_oatcake; that marks it as waiting on the person.
create or replace function public.support_reply(p_ticket bigint, p_body text, p_attachment text, p_as_oatcake boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  t support_tickets%rowtype;
  staff boolean := coalesce(p_as_oatcake, false);
begin
  select * into t from support_tickets where id = p_ticket;
  if not found then raise exception 'That conversation wasn''t found.'; end if;
  if staff and not is_platform_admin() then raise exception 'Only Oatcake can answer as Oatcake.'; end if;
  if not staff and t.user_id <> auth.uid() then raise exception 'That conversation wasn''t found.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(p_attachment, '') = '' then raise exception 'Write a message first.'; end if;
  if (select count(*) from support_messages where ticket_id = p_ticket and created_at > now() - interval '1 day') >= 60 then
    raise exception 'That''s a lot of messages today. Try again tomorrow.';
  end if;
  insert into support_messages (ticket_id, from_oatcake, author_name, body, attachment)
  values (p_ticket, staff,
          case when staff then 'Oatcake' else coalesce((select full_name from members where email = my_email()), '') end,
          left(trim(coalesce(p_body, '')), 6000), nullif(p_attachment, ''));
  update support_tickets set
    status = case when staff then 'waiting' else 'open' end,
    last_from = case when staff then 'oatcake' else 'user' end,
    user_seen_at = case when staff then user_seen_at else now() end,
    admin_seen_at = case when staff then now() else admin_seen_at end,
    updated_at = now()
  where id = p_ticket;
end $$;

-- Mark solved or reopen. The person can close their own; admins can set any status.
create or replace function public.support_set_status(p_ticket bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'waiting', 'solved') then raise exception 'Unknown status.'; end if;
  if is_platform_admin() then
    update support_tickets set status = p_status, updated_at = now() where id = p_ticket;
  else
    update support_tickets set status = case when p_status = 'solved' then 'solved' else 'open' end, updated_at = now()
    where id = p_ticket and user_id = auth.uid();
  end if;
end $$;

-- Remember when someone last read a conversation, to show a dot for new replies.
create or replace function public.support_seen(p_ticket bigint, p_as_oatcake boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_as_oatcake, false) and is_platform_admin() then
    update support_tickets set admin_seen_at = now() where id = p_ticket;
  else
    update support_tickets set user_seen_at = now() where id = p_ticket and user_id = auth.uid();
  end if;
end $$;

revoke execute on function public.support_open(text, text, text, text, text) from public, anon;
revoke execute on function public.support_reply(bigint, text, text, boolean) from public, anon;
revoke execute on function public.support_set_status(bigint, text) from public, anon;
revoke execute on function public.support_seen(bigint, boolean) from public, anon;
grant execute on function public.support_open(text, text, text, text, text) to authenticated;
grant execute on function public.support_reply(bigint, text, text, boolean) to authenticated;
grant execute on function public.support_set_status(bigint, text) to authenticated;
grant execute on function public.support_seen(bigint, boolean) to authenticated;
