-- Lets the workspace owner see which of their people have signed in yet, so the People page
-- can offer to send an invite to those who haven't.
create or replace function public.members_signed_in() returns setof text
language sql stable security definer set search_path = public, auth as $$
  select m.email from public.members m
  join auth.users u on lower(u.email) = m.email
  where m.workspace_id = public.edit_workspace() and public.my_role() = 'designer' and u.last_sign_in_at is not null
$$;
grant execute on function public.members_signed_in() to authenticated;
