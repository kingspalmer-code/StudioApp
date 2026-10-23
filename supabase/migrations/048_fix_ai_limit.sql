-- The AI daily limit (009) named its argument "what", the same as the ai_uses column, so Postgres
-- couldn't tell them apart and every call failed with 'column reference "what" is ambiguous'.
-- That stopped Draft with AI, the Job time calculator's reader and Tell Oatcake. Same rules, with
-- the column and the argument spelt out.
create or replace function public.note_ai_use(what text) returns void
language plpgsql security definer set search_path = public as $$
declare ws uuid := public.edit_workspace();
begin
  if ws is null or public.my_role() <> 'designer' then raise exception 'Only the workspace owner can do that'; end if;
  if (select count(*) from ai_uses u where u.workspace_id = ws and u.what not like 'ask%' and u.at > now() - interval '1 day') >= 40 then
    raise exception 'That''s the most AI uses for today. You can still fill it in yourself.';
  end if;
  if (select count(*) from ai_uses u where u.at > now() - interval '1 day') >= 1500 then
    raise exception 'Oatcake''s AI is busy today. You can still fill it in yourself.';
  end if;
  insert into ai_uses (workspace_id, what) values (ws, left(note_ai_use.what, 40));
end $$;
