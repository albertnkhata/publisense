-- 0046: a reason with every product decision (Albert approved the schema change on
-- 2026-10-27, wave C).
--
-- Products people add wait for review (0024). Until now the reviewer could reject with
-- no reason, an approval kept no note, and the admin Decided tab showed only the
-- latest rejection reason from board.review_note. Now:
--   * decide_board refuses a rejection without a reason ('reason_required'); a note on
--     approval is optional. Both are capped at 500 characters as before.
--   * every decision is kept in public.board_decision: the decision, the reason or
--     note, who decided, when, and who submitted the board.
--   * RLS: the submitter reads the decisions on their own board, platform admins read
--     all, nobody else (anon has no grant at all). Rows are written only by
--     decide_board (security definer); no client insert/update/delete.
--   * the submitter is notified in-app as before (data.reason on a rejection, data.note
--     on an approval), and now also by email through the existing pipeline:
--     v2_notification_email fires for 'product', v2_email_recipient accepts it,
--     v2_email_send renders it. The pipeline's rules apply unchanged: email prefs,
--     reserved test domains (.test/.example/.invalid/localhost) skipped, daily cap.
--     Product emails have no post, so they are never held for batching.
--   * board.review_note is still set on rejection (the rejected board page shows it),
--     so nothing that reads it changes.
--   * existing decisions are backfilled from board.reviewed_by / reviewed_at /
--     review_note. The "reason on reject" check is NOT VALID so old rows without a
--     reason are kept; every new row is checked.
--
-- Rollback (one transaction):
--   begin;
--   -- restore the pre-0046 functions exactly as they were on production:
--   \i supabase/rollback/0046_down.sql   (or paste its contents)
--   commit;
-- 0046_down.sql re-creates decide_board, v2_email_recipient and v2_email_send from
-- their pre-0046 definitions, puts the email trigger back to reply/status_change only,
-- drops public.board_decision and removes the 0046 row from schema_migrations.

-- ------------------------------------------------------------ decisions

create table if not exists public.board_decision (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.board (id) on delete cascade,
  decision    text not null check (decision in ('approved', 'rejected')),
  note        text check (note is null or (char_length(note) between 1 and 500)),
  decided_by  uuid references public.profile (id) on delete set null,
  submitter   uuid references public.profile (id) on delete set null,
  decided_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_decision_reject_reason'
                   and conrelid = 'public.board_decision'::regclass) then
    alter table public.board_decision
      add constraint board_decision_reject_reason check (decision = 'approved' or note is not null) not valid;
  end if;
end $$;

create index if not exists board_decision_board_idx on public.board_decision (board_id, decided_at desc);
create index if not exists board_decision_submitter_idx on public.board_decision (submitter);

alter table public.board_decision enable row level security;

revoke all on table public.board_decision from public, anon, authenticated;
grant select on table public.board_decision to authenticated;

drop policy if exists "v2 board decision read" on public.board_decision;
create policy "v2 board decision read" on public.board_decision
  for select to authenticated
  using ((auth.uid() is not null and submitter = auth.uid()) or private.is_platform_admin());

-- Backfill what is already decided (one row per board; no reason on old approvals).
insert into public.board_decision (board_id, decision, note, decided_by, submitter, decided_at)
select b.id, case when b.status = 'rejected' then 'rejected' else 'approved' end,
       case when b.status = 'rejected' then nullif(btrim(coalesce(b.review_note, '')), '') end,
       b.reviewed_by, b.created_by, b.reviewed_at
  from public.board b
 where b.reviewed_at is not null and b.status in ('live', 'rejected')
   and not exists (select 1 from public.board_decision d where d.board_id = b.id);

-- ------------------------------------------------------------ decide_board

create or replace function public.decide_board(p_board uuid, p_approve boolean, p_name text DEFAULT NULL::text, p_tagline text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_hub_mode text DEFAULT 'keep'::text, p_hub_id uuid DEFAULT NULL::uuid, p_hub_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid    uuid := auth.uid();
  b      board;
  h      hub;
  v_old  uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag  text := case when p_tagline is null then null else btrim(regexp_replace(p_tagline, '\s+', ' ', 'g')) end;
  v_cat  text := lower(btrim(coalesce(p_category, '')));
  v_why  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_mode text := lower(coalesce(nullif(btrim(p_hub_mode), ''), 'keep'));
  v_hub  text := nullif(btrim(regexp_replace(coalesce(p_hub_name, ''), '\s+', ' ', 'g')), '');
  v_submitter uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status <> 'pending' then return public.v2_err('decided'); end if;
  -- 0046: a rejection needs a reason (the submitter is told why); a note on approval is optional.
  if v_why is not null and char_length(v_why) > 500 then return public.v2_err('reason_length'); end if;
  if not p_approve and v_why is null then return public.v2_err('reason_required'); end if;
  v_old := b.hub_id;
  v_submitter := b.created_by;

  if p_approve then
    if v_name = '' then v_name := b.name; end if;
    if char_length(v_name) > 60 then return public.v2_err('name_length'); end if;
    if v_tag is not null and char_length(v_tag) > 120 then return public.v2_err('tagline_length'); end if;
    if v_cat = '' then v_cat := b.category; end if;
    if not public.v2_category_ok(v_cat) then return public.v2_err('invalid_category'); end if;
    if v_mode not in ('keep', 'set', 'none') then return public.v2_err('invalid_company'); end if;
    if v_hub is not null and char_length(v_hub) > 60 then return public.v2_err('company_length'); end if;

    if v_mode = 'keep' and b.hub_id is not null then
      select * into h from hub where id = b.hub_id for update;
    elsif v_mode = 'set' then
      select * into h from hub where id = p_hub_id and status <> 'rejected' for update;
      if not found then return public.v2_err('company_not_found'); end if;
    end if;

    if h.id is not null and h.status = 'pending' then
      update hub
         set name = coalesce(v_hub, name),
             slug = case when v_hub is not null and lower(v_hub) <> lower(name) then public.v2_hub_slug(v_hub) else slug end,
             status = 'live', reviewed_by = uid, reviewed_at = now()
       where id = h.id returning * into h;
    end if;

    update board
       set name = v_name, tagline = coalesce(v_tag, tagline), category = v_cat, hub_id = h.id,
           status = 'live', reviewed_by = uid, reviewed_at = now(), review_note = null
     where id = b.id returning * into b;
    if v_old is distinct from b.hub_id then perform public.v2_hub_retire_if_orphan(v_old, uid); end if;
  else
    update board set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_why
     where id = b.id returning * into b;
    perform public.v2_hub_retire_if_orphan(b.hub_id, uid);
  end if;

  insert into board_decision (board_id, decision, note, decided_by, submitter)
  values (b.id, case when p_approve then 'approved' else 'rejected' end, v_why, uid, v_submitter);

  perform public.v2_notify(b.created_by, 'product', uid, 'board', b.id, null,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                       'slug', b.slug, 'name', b.name,
                       'reason', case when p_approve then null else v_why end,
                       'note', case when p_approve then v_why else null end));
  return jsonb_build_object('ok', true, 'status', b.status, 'slug', b.slug,
                            'hub', case when h.id is not null then h.slug end);
end $function$;


-- ------------------------------------------------------------ email for 'product'

create or replace function public.v2_email_recipient(n notification)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_to text;
begin
  -- reply / status_change are about a post; product (0046) is about the board someone added.
  if not ((n.kind in ('reply', 'status_change') and n.post_id is not null)
          or (n.kind = 'product' and n.target_type = 'board' and n.target_id is not null)) then
    return null;
  end if;
  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return null;
  end if;
  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  return v_to;
end $function$;

create or replace function public.v2_email_send(n notification, p_to text, p_more integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind   text := 'v2_notify_' || n.kind::text;
  v_key    text;
  v_req    bigint;
  v_token  uuid;
  v_post   record;
  v_board  record;
  v_actor  text;
  v_body   text;
  v_note   text;
  v_status text;
  v_subject text;
  v_lead   text;
  v_quote  text;
  v_more   text := '';
  v_url    text;
  v_unsub  text;
  v_one_click text;
  v_text   text;
  v_html   text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, p_to, 'no_transport', 'pg_net or vault missing');
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then
    insert into email_log (notification_id, kind, recipient, status, detail) values (n.id::text, v_kind, p_to, 'no_secret', 'resend_api_key missing from vault');
    return;
  end if;

  if n.kind = 'product' then
    select b.id, b.name, b.slug into v_board from board b where b.id = n.target_id;
    if v_board.id is null then return; end if;
  else
    select p.id, p.title, b.name as board into v_post from post p join board b on b.id = p.board_id where p.id = n.post_id;
    if v_post.id is null then return; end if;
  end if;
  select coalesce(nullif(btrim(name), ''), '@' || handle, 'Someone') into v_actor from profile where id = n.actor;
  v_actor := coalesce(v_actor, 'Someone');

  insert into email_token (user_id) values (n.recipient) on conflict (user_id) do nothing;
  select token into v_token from email_token where user_id = n.recipient;

  -- (if/else, not CASE: a record's fields can't be referenced before it is assigned)
  if n.kind = 'product' then
    v_url := 'https://publisense.app/b/' || v_board.slug;
  else
    v_url := 'https://publisense.app/post/' || n.post_id::text;
  end if;
  v_unsub := 'https://publisense.app/unsubscribe?token=' || v_token::text;
  v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text;

  if n.kind = 'product' then
    -- 0046: the person who added a product hears the decision; a rejection carries its reason.
    if n.data ->> 'status' = 'approved' then
      v_quote   := v2_clip(n.data ->> 'note', 600);
      v_subject := v2_clip(v_board.name || ' is live on Publisense', 120);
      v_lead    := v_board.name || ', the product you added, was approved and is now live on Publisense.'
                || case when coalesce(v_quote, '') <> '' then ' A note from the team:' else '' end;
    else
      v_quote   := v2_clip(n.data ->> 'reason', 600);
      v_subject := v2_clip(v_board.name || ' wasn’t approved', 120);
      v_lead    := v_board.name || ', the product you added, wasn’t approved for Publisense.'
                || case when coalesce(v_quote, '') <> '' then ' The reason from the team:' else '' end;
    end if;
  elsif n.kind = 'reply' then
    select body into v_body from reply where id = n.target_id;
    v_subject := v2_clip(v_actor || ' replied: ' || v_post.title, 120);
    v_lead    := v_actor || ' replied to your post “' || v2_clip(v_post.title, 100) || '” on ' || v_post.board || ':';
    v_quote   := v2_clip(v_body, 600);
    if coalesce(p_more, 0) > 0 then
      v_more := 'Plus ' || p_more || ' more ' || case when p_more = 1 then 'reply' else 'replies' end || ' on this post.';
    end if;
  else
    v_status := replace(coalesce(n.data ->> 'to', ''), '_', ' ');
    v_status := upper(left(v_status, 1)) || substr(v_status, 2);
    select note into v_note from status_event where post_id = n.post_id order by at desc limit 1;
    v_subject := v2_clip(v_status || ': ' || v_post.title, 120);
    v_lead    := 'The ' || v_post.board || ' team marked “' || v2_clip(v_post.title, 100) || '” as ' || lower(v_status) || '.';
    v_quote   := v2_clip(v_note, 600);
  end if;

  v_text := v_lead || E'\n\n'
         || case when coalesce(v_quote, '') <> '' then v_quote || E'\n\n' else '' end
         || case when v_more <> '' then v_more || E'\n\n' else '' end
         || 'View it: ' || v_url || E'\n\n'
         || '— Publisense' || E'\n\n'
         || 'You get this because of your Publisense notification settings. Turn these emails off: ' || v_unsub;

  v_html := '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">'
         || '<p>' || v2_html(v_lead) || '</p>'
         || case when coalesce(v_quote, '') <> ''
                 then '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #ddd;color:#333">' || v2_html(v_quote) || '</blockquote>'
                 else '' end
         || case when v_more <> '' then '<p style="color:#555">' || v2_html(v_more) || '</p>' else '' end
         || '<p><a href="' || v_url || '" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#0047AB;color:#fff;text-decoration:none">View on Publisense</a></p>'
         || '<p style="font-size:12px;color:#777;margin-top:32px">You get this because of your Publisense notification settings. '
         || '<a href="' || v_unsub || '" style="color:#777">Unsubscribe from all emails</a> · '
         || '<a href="https://publisense.app/settings" style="color:#777">Choose which emails</a></p></div>';

  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 8000)'
    into v_req
    using 'https://api.resend.com/emails',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          jsonb_build_object(
            'from', 'Publisense <notify@publisense.app>',
            'to', jsonb_build_array(p_to),
            'reply_to', 'support@publisense.app',
            'subject', v_subject,
            'text', v_text,
            'html', v_html,
            'headers', jsonb_build_object(
              'List-Unsubscribe', '<' || v_one_click || '>',
              'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  insert into email_log (notification_id, kind, recipient, status, request_id) values (n.id::text, v_kind, p_to, 'queued', v_req);
exception when others then
  begin
    insert into email_log (notification_id, kind, recipient, status, detail)
    values (n.id::text, v_kind, coalesce(p_to, ''), 'error', left(sqlstate || ' ' || sqlerrm, 300));
  exception when others then null;
  end;
end $function$;


drop trigger if exists v2_notification_email on public.notification;
create trigger v2_notification_email
  after insert on public.notification
  for each row when (new.kind in ('reply', 'status_change', 'product'))
  execute function public.v2_notification_email_after();
