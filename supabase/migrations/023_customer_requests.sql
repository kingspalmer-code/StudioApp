-- Customers workspaces: a public request link (no sign-up) and a private page per customer,
-- opened from an emailed link, where they follow all their jobs and reply.

alter table public.workspaces add column if not exists request_slug text unique;
alter table public.workspaces add column if not exists requests_open boolean not null default false;
alter table public.businesses add column if not exists access_token uuid not null default gen_random_uuid();
create unique index if not exists businesses_access_token_idx on public.businesses (access_token);

-- What the request form needs: the workspace's name, kinds of job and form questions. Prices,
-- payments and sign-off are the owner's to fill in, so they're left off. Null if the link is off.
create or replace function public.request_form(slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', w.name,
    'owner_name', w.owner_name,
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'lead_days', t.lead_days) order by t.position, t.id)
                       from job_types t where t.workspace_id = w.id), '[]'),
    'fields', coalesce((select jsonb_agg(to_jsonb(f) - 'workspace_id' order by f.position, f.id)
                        from job_fields f where f.workspace_id = w.id and f.on_form and not f.hidden
                          and f.kind <> 'files' and f.key not in ('quote_amount', 'paid_amount', 'requester_name', 'approver')), '[]'))
  from workspaces w
  where w.request_slug = lower(slug) and w.requests_open and w.kind = 'trade'
$$;

-- A member of the public asking for a job. Finds them by email (or adds them as a customer) and
-- puts the job in the first stage. Anyone can call this with any email, so it never hands back the
-- customer's private token: that only travels in emails sent from the owner's side.
create or replace function public.send_customer_request(slug text, cust_name text, cust_email text, cust_phone text,
  job_title text, job_type text, need_by date, cols jsonb, extra jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  em text := lower(trim(coalesce(cust_email, '')));
  nm text := left(trim(coalesce(cust_name, '')), 80);
  biz uuid;
  tid bigint;
  c jsonb := coalesce(cols, '{}');
begin
  select w.id into ws from workspaces w where w.request_slug = lower(slug) and w.requests_open and w.kind = 'trade';
  if ws is null then raise exception 'This request link is switched off'; end if;
  if nm = '' then raise exception 'Add your name'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add a working email address'; end if;
  if length(trim(coalesce(job_title, ''))) = 0 then raise exception 'Say what the job is'; end if;
  if pg_column_size(c) + pg_column_size(coalesce(extra, '{}')) > 20000 then raise exception 'That''s too long'; end if;
  -- Keep the link from being flooded: a few a day from one email, and a cap per workspace.
  if (select count(*) from tickets t where t.workspace_id = ws and t.created_by = em and t.created_at > now() - interval '1 day') >= 5
     or (select count(*) from tickets t where t.workspace_id = ws and t.details ? 'via_link' and t.created_at > now() - interval '1 day') >= 60 then
    raise exception 'Too many requests today. Try again tomorrow, or get in touch directly.';
  end if;

  select b.id into biz from businesses b
  where b.workspace_id = ws and lower(b.email) = em and b.slug not like 'self-%' order by b.name limit 1;
  if biz is null then
    insert into businesses (name, slug, color, email, phone, workspace_id)
    values (nm, setup_slug(nm) || '-' || substr(md5(random()::text), 1, 4), '#8a7a70', em, left(trim(coalesce(cust_phone, '')), 40), ws)
    returning id into biz;
  elsif coalesce(trim(cust_phone), '') <> '' then
    update businesses b set phone = left(trim(cust_phone), 40) where b.id = biz and b.phone = '';
  end if;

  insert into tickets (business_id, workspace_id, created_by, requester_name, title, type, deadline, status,
                       formats, brief, copy, links, colours, event_date, site_address, details)
  values (biz, ws, em, nm, left(trim(job_title), 120),
          coalesce((select jt.name from job_types jt where jt.workspace_id = ws and jt.name = job_type),
                   (select jt.name from job_types jt where jt.workspace_id = ws order by jt.position, jt.id limit 1), 'Other'),
          coalesce(need_by, current_date + 14), public.first_stage(ws),
          left(coalesce(c ->> 'formats', ''), 500), left(coalesce(c ->> 'brief', ''), 5000), left(coalesce(c ->> 'copy', ''), 5000),
          left(coalesce(c ->> 'links', ''), 1000), left(coalesce(c ->> 'colours', ''), 500),
          nullif(c ->> 'event_date', '')::date, left(coalesce(c ->> 'site_address', ''), 500),
          (case when jsonb_typeof(extra) = 'object' then extra else '{}' end) || '{"via_link": true}')
  returning id into tid;
  return tid;
end $$;

-- A customer's private page: every job of theirs, where it's up to, and the conversation on it.
create or replace function public.customer_page(token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'customer', b.name,
    'email', b.email,
    'workspace', w.name,
    'owner_name', w.owner_name,
    'slug', case when w.requests_open then w.request_slug end,
    'stages', (select jsonb_agg(jsonb_build_object('key', s.key, 'label', s.label, 'color', s.color) order by s.position, s.id) from stages s where s.workspace_id = w.id),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'type', t.type, 'status', t.status, 'created_at', t.created_at,
        'deadline', t.deadline, 'delivered_at', t.delivered_at,
        'notes', coalesce((select jsonb_agg(jsonb_build_object('who', n.author_name, 'mine', n.author_email = b.email, 'body', n.body, 'at', n.created_at) order by n.created_at)
                           from ticket_notes n where n.ticket_id = t.id and n.draft_id is null and n.kind = 'note'), '[]')
      ) order by t.created_at desc) from tickets t where t.business_id = b.id), '[]'))
  from businesses b join workspaces w on w.id = b.workspace_id
  where b.access_token = token and w.kind = 'trade'
$$;

-- A customer replying on one of their jobs from their page.
create or replace function public.customer_reply(token uuid, job bigint, message text)
returns void language plpgsql security definer set search_path = public as $$
declare b businesses;
begin
  select bz.* into b from businesses bz join workspaces w on w.id = bz.workspace_id where bz.access_token = token and w.kind = 'trade';
  if b.id is null then raise exception 'This link no longer works'; end if;
  if not exists (select 1 from tickets where id = job and business_id = b.id) then raise exception 'That job isn''t yours'; end if;
  if length(trim(coalesce(message, ''))) = 0 then return; end if;
  if (select count(*) from ticket_notes where ticket_id = job and author_email = b.email and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of messages. Try again a bit later.';
  end if;
  insert into ticket_notes (ticket_id, author_email, author_name, body) values (job, coalesce(nullif(b.email, ''), 'customer'), b.name, left(trim(message), 4000));
end $$;

revoke execute on function public.request_form(text) from public;
revoke execute on function public.send_customer_request(text, text, text, text, text, text, date, jsonb, jsonb) from public;
revoke execute on function public.customer_page(uuid) from public;
revoke execute on function public.customer_reply(uuid, bigint, text) from public;
grant execute on function public.request_form(text) to anon, authenticated;
grant execute on function public.send_customer_request(text, text, text, text, text, text, date, jsonb, jsonb) to anon, authenticated;
grant execute on function public.customer_page(uuid) to anon, authenticated;
grant execute on function public.customer_reply(uuid, bigint, text) to anon, authenticated;

-- For the server (with the alerts secret) right after someone sends a job through a request link:
-- who to email their private link to, and who runs the workspace, to alert them.
create or replace function public.link_request_info(p_secret text, p_ticket bigint)
returns table (customer text, email text, token uuid, workspace text, title text, owners text[])
language plpgsql security definer set search_path = public as $$
begin
  perform push_check(p_secret);
  return query
    select b.name, b.email, b.access_token, w.name, t.title,
           array(select m.email from members m where m.workspace_id = t.workspace_id and m.role = 'designer')
    from tickets t join businesses b on b.id = t.business_id join workspaces w on w.id = t.workspace_id
    where t.id = p_ticket and t.details ? 'via_link' and t.created_at > now() - interval '15 minutes';
end $$;
revoke execute on function public.link_request_info(text, bigint) from public;
grant execute on function public.link_request_info(text, bigint) to anon, authenticated;
