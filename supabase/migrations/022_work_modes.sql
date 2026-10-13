-- Three ways to use Oatcake: Businesses ('studio'), Customers ('trade') and Just me ('solo').
-- Owners switch between them in Settings by updating workspaces.kind (the existing owner policy).

alter table public.workspaces drop constraint if exists workspaces_kind_check;
alter table public.workspaces add constraint workspaces_kind_check check (kind in ('studio', 'trade', 'solo'));

-- Sign-up: set up a workspace from the (suggested or blank) setup, as the kind they picked.
create or replace function public.start_workspace_as(ws_name text, owner_name text, ws_kind text, setup jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if ws_kind not in ('studio', 'trade', 'solo') then raise exception 'Pick who your work is for'; end if;
  ws := start_custom_workspace(ws_name, owner_name, ws_kind = 'studio', setup);
  if ws_kind = 'solo' then update workspaces set kind = 'solo' where id = ws; end if;
  return ws;
end $$;
revoke execute on function public.start_workspace_as(text, text, text, jsonb) from public, anon;
grant execute on function public.start_workspace_as(text, text, text, jsonb) to authenticated;
