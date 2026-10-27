-- Rollback for 0050 (nested reply threads, reply notifications, claim code wait time).
-- Restores the five functions exactly as deployed before 0050 (pg_get_functiondef on
-- production, 2026-10-27). CREATE OR REPLACE keeps owners and grants. Then re-flattens:
-- any reply deeper than one level is re-parented onto its top-level ancestor, which is
-- what the pre-0050 app can show. Who answered whom below the first level is lost.

CREATE OR REPLACE FUNCTION public.v2_reply_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare parent reply;
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'sign in to reply' using errcode = '42501'; end if;
    new.author_id  := auth.uid();
    new.hidden_at  := null;
    new.edited_at  := null;
    new.created_at := now();
    if private.is_blocked(private.post_board(new.post_id)) then
      raise exception 'blocked on this board' using errcode = '42501';
    end if;
    if new.is_official and not private.is_board_team(private.post_board(new.post_id)) then
      raise exception 'only the team can reply officially' using errcode = '42501';
    end if;
  end if;
  if new.parent_id is not null then
    select * into parent from reply where id = new.parent_id;
    if parent.post_id is distinct from new.post_id then
      raise exception 'parent reply belongs to another post' using errcode = 'check_violation';
    end if;
    if parent.parent_id is not null then
      new.parent_id := parent.parent_id;   -- flatten: reply to a reply joins its thread
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.v2_reply_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p post; parent_author uuid;
begin
  if tg_op = 'DELETE' then
    update post set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  update post set reply_count = reply_count + 1 where id = new.post_id returning * into p;
  if new.parent_id is not null then
    select author_id into parent_author from reply where id = new.parent_id;
    perform v2_notify(parent_author, 'reply', new.author_id, 'reply', new.id, new.post_id);
  end if;
  if p.author_id is distinct from parent_author then
    perform v2_notify(p.author_id, 'reply', new.author_id, 'reply', new.id, new.post_id);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.start_domain_email(p_email text, p_domain text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_dom  text := lower(btrim(coalesce(p_domain, '')));
  v_code text;
  v_salt text;
  recent int;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  if v_dom !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_domain'); end if;
  if public.v2_is_shared_domain(v_dom) then return public.v2_err('shared_domain'); end if;
  if not public.v2_domain_covers(v_dom, split_part(v_mail, '@', 2)) then return public.v2_err('wrong_domain'); end if;

  select count(*) into recent from domain_challenge
   where user_id = uid and method = 'email' and created_at > now() - interval '1 hour';
  if recent >= 5 then return public.v2_err('rate_limited'); end if;

  delete from domain_challenge where user_id = uid and created_at < now() - interval '1 day';
  -- A new code replaces any earlier one for the same domain.
  update domain_challenge set expires_at = now()
   where user_id = uid and method = 'email' and domain = v_dom and expires_at > now();

  v_code := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_salt := replace(gen_random_uuid()::text, '-', '');
  insert into domain_challenge (user_id, domain, method, work_email, code_hash, expires_at)
  values (uid, v_dom, 'email', v_mail, public.v2_code_hash(v_salt, v_code), now() + interval '10 minutes');

  return public.v2_send_code(v_mail, v_dom, v_code);
end $function$;

CREATE OR REPLACE FUNCTION public.v2_email_recipient(n notification)
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
  v_board  record;
  v_actor  text;
  v_official boolean := false;
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
    select body, is_official into v_body, v_official from reply where id = n.target_id;
    -- 0048: an official reply speaks as the board, never as the teammate who wrote it.
    if coalesce(v_official, false) then
      v_actor := v_post.board || ' · Team';
    end if;
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
    v_lead    := v_post.board || ' · Team marked “' || v2_clip(v_post.title, 100) || '” as ' || lower(v_status) || '.';
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

with recursive tree as (
  select id, id as root from public.reply where parent_id is null
  union all
  select r.id, t.root from public.reply r join tree t on r.parent_id = t.id
)
update public.reply r set parent_id = t.root
  from tree t, public.reply p
 where t.id = r.id and p.id = r.parent_id and p.parent_id is not null;
