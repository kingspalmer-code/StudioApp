-- Nudges: an Oatcake admin writes to someone who signed up but hasn't got going, e.g. offering a call
-- to help set up. Each nudge is a help conversation started by Oatcake (page = 'nudge'), so their
-- reply lands in Admin → Support and the last one sent shows when they were last nudged.
create or replace function public.support_nudge(p_user uuid, p_subject text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  t_id bigint;
  u_email text;
  who public.members%rowtype;
begin
  if not is_platform_admin() then raise exception 'Only Oatcake admins can nudge people.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first.'; end if;
  select lower(email) into u_email from auth.users where id = p_user;
  if u_email is null then raise exception 'That person wasn''t found.'; end if;
  if exists (select 1 from support_tickets where user_id = p_user and page = 'nudge' and created_at > now() - interval '2 minutes') then
    raise exception 'They were nudged a moment ago already.';
  end if;
  select * into who from members where email = u_email;
  -- user_seen_at starts before the message, so it shows as new in their Help.
  insert into support_tickets (user_id, email, name, workspace_id, subject, status, page, last_from, user_seen_at, admin_seen_at)
  values (p_user, u_email, coalesce(who.full_name, ''), who.workspace_id, left(trim(coalesce(p_subject, '')), 140),
          'waiting', 'nudge', 'oatcake', now() - interval '1 second', now())
  returning id into t_id;
  insert into support_messages (ticket_id, from_oatcake, author_name, body)
  values (t_id, true, 'Oatcake', left(trim(p_body), 6000));
  return t_id;
end $$;

revoke execute on function public.support_nudge(uuid, text, text) from public, anon;
grant execute on function public.support_nudge(uuid, text, text) to authenticated;
