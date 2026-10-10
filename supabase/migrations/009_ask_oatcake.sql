-- Ask Oatcake: its own daily limit, separate from quote drafting, and limit messages that don't say "AI".
create or replace function public.note_ai_use(what text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid := public.edit_workspace();
begin
  if ws is null or public.my_role() <> 'designer' then raise exception 'Only the workspace owner can do that'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and what not like 'ask%' and at > now() - interval '1 day') >= 40 then
    raise exception 'That''s the most drafts for today. You can still fill it in yourself.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1500 then
    raise exception 'Drafting is busy today. You can still fill it in yourself.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, left(what, 40));
end $$;

create or replace function public.note_ask() returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid := public.edit_workspace();
begin
  if ws is null or public.my_role() <> 'designer' then raise exception 'Only the workspace owner can ask Oatcake for now.'; end if;
  if (select count(*) from ai_uses where workspace_id = ws and what = 'ask' and at > now() - interval '1 day') >= 60 then
    raise exception 'That''s all the questions for today. Ask again tomorrow.';
  end if;
  if (select count(*) from ai_uses where at > now() - interval '1 day') >= 1500 then
    raise exception 'Oatcake is busy today. Try again tomorrow.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, 'ask');
end $$;
revoke execute on function public.note_ask() from public, anon;
grant execute on function public.note_ask() to authenticated;
