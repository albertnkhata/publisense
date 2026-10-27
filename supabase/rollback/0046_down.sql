-- Rollback for 0046_v2_product_decision_note.sql. Run inside one transaction:
--   begin; <this file>; commit;
-- Restores decide_board, v2_email_recipient and v2_email_send exactly as they were on
-- production before 0046 (taken with pg_get_functiondef on 2026-10-27), the email
-- trigger for reply/status_change only, and drops public.board_decision.
-- board.review_note was never changed by 0046, so rejection reasons stay on the board.

CREATE OR REPLACE FUNCTION public.decide_board(p_board uuid, p_approve boolean, p_name text DEFAULT NULL::text, p_tagline text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_hub_mode text DEFAULT 'keep'::text, p_hub_id uuid DEFAULT NULL::uuid, p_hub_name text DEFAULT NULL::text)
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
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.status <> 'pending' then return public.v2_err('decided'); end if;
  v_old := b.hub_id;

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
    if v_why is not null and char_length(v_why) > 500 then return public.v2_err('reason_length'); end if;
    update board set status = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_why
     where id = b.id returning * into b;
    perform public.v2_hub_retire_if_orphan(b.hub_id, uid);
  end if;

  perform public.v2_notify(b.created_by, 'product', uid, 'board', b.id, null,
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
                       'slug', b.slug, 'name', b.name, 'reason', v_why));
  return jsonb_build_object('ok', true, 'status', b.status, 'slug', b.slug,
                            'hub', case when h.id is not null then h.slug end);
end $function$;

CREATE OR REPLACE FUNCTION public.v2_email_recipient(n notification)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_to text;
begin
  if n.kind not in ('reply', 'status_change') or n.post_id is null then return null; end if;
  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return null;
  end if;
  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  return v_to;
end $function$;

CREATE OR REPLACE FUNCTION public.v2_email_send(n notification, p_to text, p_more integer DEFAULT 0)
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

  select p.id, p.title, b.name as board into v_post from post p join board b on b.id = p.board_id where p.id = n.post_id;
  if v_post.id is null then return; end if;
  select coalesce(nullif(btrim(name), ''), '@' || handle, 'Someone') into v_actor from profile where id = n.actor;
  v_actor := coalesce(v_actor, 'Someone');

  insert into email_token (user_id) values (n.recipient) on conflict (user_id) do nothing;
  select token into v_token from email_token where user_id = n.recipient;

  v_url   := 'https://publisense.app/post/' || n.post_id::text;
  v_unsub := 'https://publisense.app/unsubscribe?token=' || v_token::text;
  v_one_click := 'https://publisense.app/api/unsubscribe?token=' || v_token::text;

  if n.kind = 'reply' then
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
create trigger v2_notification_email after insert on public.notification
  for each row when (new.kind in ('reply', 'status_change'))
  execute function public.v2_notification_email_after();

drop table if exists public.board_decision;

delete from supabase_migrations.schema_migrations where version = '0046';
