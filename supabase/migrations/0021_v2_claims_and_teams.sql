-- Publisense v2, step 7 of docs/v2/BUILD.md: claiming, teams, join requests, disputes.
--
-- ADDITIVE ONLY. New functions, two new nullable columns on domain_challenge, and
-- execute grants. No v1 object is read, altered or dropped; no existing v2 policy,
-- trigger or function is replaced.
--
-- 0016/0017 created the tables (verified_domain, domain_challenge, membership,
-- join_request, ownership_dispute) and said the RPCs that issue and check proofs
-- "arrive in step 7". membership has no client insert/update grant on purpose, so
-- every way into a team goes through a SECURITY DEFINER function here that checks
-- the caller first. Every function returns jsonb { ok, error?, ... } in the 0017
-- style, so the UI can map each refusal to the mockup's wording.
--
-- Domain proof (FOUNDATION section 7, Claim: unclaimed -> verifying -> claimed):
--   * email: start_domain_email sends a 6-digit code to an address on the domain;
--     verify_domain_email checks it (10 minutes, 5 tries, 5 codes an hour). The code
--     is stored as a salted sha256, never in clear. Mail goes out through pg_net +
--     Resend with the key in Vault, exactly like 0015; the browser never sees either.
--   * dns: start_domain_dns hands out a TXT token; check_domain_dns asks
--     Cloudflare's DNS-over-HTTPS resolver through pg_net. pg_net is asynchronous,
--     so the first call fires the lookup and returns { pending: true } and the next
--     call (the UI polls) reads the answer.
-- Shared hosts (gmail.com, vercel.app ...) are refused before any mail is sent; the
-- 0017 trigger on verified_domain stays the backstop.
--
-- PORTABILITY. pg_net and Vault exist only on Supabase. Everything that needs them
-- is reached through EXECUTE and guarded by a schema check, so on CI's stock
-- Postgres the functions compile and answer { ok: false, error: 'email_unavailable' }
-- or 'dns_unavailable' instead of failing. CI tests the rules; delivery is live-only.

-- ================================================================ columns

alter table public.domain_challenge add column if not exists dns_request_id bigint;
alter table public.domain_challenge add column if not exists dns_checked_at timestamptz;
create index if not exists domain_challenge_user_idx on public.domain_challenge (user_id, method, domain, created_at desc);

-- ================================================================ helpers

-- "figma.com/figjam" -> "figma.com"; "www.arc.net" -> "arc.net".
create or replace function public.v2_site_domain(p_site text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(split_part(btrim(coalesce(p_site, '')), '/', 1)), '^www\.', ''), '');
$$;

-- Does a verified domain cover a target? Itself or any subdomain of it.
create or replace function public.v2_domain_covers(p_verified text, p_target text)
returns boolean language sql immutable as $$
  select coalesce(p_verified <> '' and p_target <> ''
         and (p_target = p_verified or right(p_target, char_length(p_verified) + 1) = '.' || p_verified), false);
$$;

create or replace function public.v2_is_shared_domain(p_domain text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shared_domain s where public.v2_domain_covers(s.domain, lower(p_domain)));
$$;

-- The domain a scope is proved by: a board's site host, a hub's primary domain.
create or replace function public.v2_scope_domain(p_scope public.v2_scope, p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'board' then (select public.v2_site_domain(site) from board where id = p_id)
    else (select primary_domain from hub where id = p_id)
  end;
$$;

-- Has the caller proved a domain that covers p_target?
create or replace function public.v2_has_verified(p_target text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and p_target is not null and exists (
    select 1 from verified_domain where verified_by = uid and public.v2_domain_covers(domain, p_target));
$$;

-- Is the scope run by a verified team? A board also counts when its hub is claimed,
-- since a hub membership covers every board in the hub.
create or replace function public.v2_scope_claimed(p_scope public.v2_scope, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'board' then exists (select 1 from board b left join hub h on h.id = b.hub_id
                               where b.id = p_id and (b.claimed_at is not null or h.claimed_at is not null))
    else exists (select 1 from hub where id = p_id and claimed_at is not null)
  end;
$$;

-- The caller's effective role on a scope (a hub role counts on the hub's boards).
create or replace function public.v2_scope_role(p_scope public.v2_scope, p_id uuid, uid uuid default auth.uid())
returns public.v2_role language sql stable security definer set search_path = public as $$
  select case p_scope when 'board' then public.board_role(p_id, uid) else public.hub_role(p_id, uid) end;
$$;

create or replace function public.v2_code_hash(p_salt text, p_code text)
returns text language sql immutable as $$
  select p_salt || '$' || encode(sha256(convert_to(p_salt || ':' || p_code, 'UTF8')), 'hex');
$$;

create or replace function public.v2_err(p_error text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', p_error) || p_extra;
$$;

-- Send a verification code. Internal: holds the Resend key, never callable over RPC.
create or replace function public.v2_send_code(p_to text, p_domain text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text; v_req bigint;
begin
  if p_to ~* '@([a-z0-9-]+\.)*(invalid|test|example|localhost)$' then
    insert into email_log (kind, recipient, status, detail) values ('v2_domain_code', p_to, 'skipped', 'reserved domain');
    return public.v2_err('email_unavailable');
  end if;
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    insert into email_log (kind, recipient, status, detail) values ('v2_domain_code', p_to, 'no_transport', 'pg_net or vault missing');
    return public.v2_err('email_unavailable');
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'resend_api_key';
  if v_key is null then
    insert into email_log (kind, recipient, status, detail) values ('v2_domain_code', p_to, 'no_secret', 'resend_api_key missing from vault');
    return public.v2_err('email_unavailable');
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 8000)'
    into v_req
    using 'https://api.resend.com/emails',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          jsonb_build_object(
            'from', 'Publisense <notify@publisense.app>',
            'to', jsonb_build_array(p_to),
            'subject', p_code || ' is your Publisense code',
            'text', 'Your Publisense code is ' || p_code || '.' || E'\n\n'
                    || 'Enter it to confirm you work at ' || p_domain || '. It expires in 10 minutes.' || E'\n\n'
                    || 'If you didn''t ask for this, you can ignore this email: nothing changes until the code is entered.'
                    || E'\n\n— Publisense\nhttps://publisense.app');
  -- The code itself is never logged.
  insert into email_log (kind, recipient, status, request_id) values ('v2_domain_code', p_to, 'queued', v_req);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.v2_send_code(text, text, text) from public, anon, authenticated;

-- ================================================================ domain proof: email code

create or replace function public.start_domain_email(p_email text, p_domain text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.verify_domain_email(p_email text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_code text := btrim(coalesce(p_code, ''));
  c      domain_challenge;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into c from domain_challenge
   where user_id = uid and method = 'email' and work_email = v_mail
   order by created_at desc limit 1 for update;
  if not found or c.expires_at <= now() then return public.v2_err('expired'); end if;
  if c.attempts >= 5 then return public.v2_err('too_many_attempts'); end if;
  if v_code !~ '^[0-9]{6}$' or public.v2_code_hash(split_part(c.code_hash, '$', 1), v_code) <> c.code_hash then
    update domain_challenge set attempts = attempts + 1 where id = c.id;
    return public.v2_err(case when c.attempts + 1 >= 5 then 'too_many_attempts' else 'wrong_code' end);
  end if;
  insert into verified_domain (domain, verified_by, method) values (c.domain, uid, 'email')
  on conflict (domain, verified_by) do nothing;
  delete from domain_challenge where id = c.id;
  return jsonb_build_object('ok', true, 'domain', c.domain);
end $$;

-- ================================================================ domain proof: DNS TXT

create or replace function public.start_domain_dns(p_domain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  v_dom text := lower(btrim(coalesce(p_domain, '')));
  c     domain_challenge;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if v_dom !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_domain'); end if;
  if public.v2_is_shared_domain(v_dom) then return public.v2_err('shared_domain'); end if;
  select * into c from domain_challenge
   where user_id = uid and method = 'dns' and domain = v_dom and expires_at > now()
   order by created_at desc limit 1;
  if not found then
    insert into domain_challenge (user_id, domain, method, dns_token, expires_at)
    values (uid, v_dom, 'dns', 'publisense-verify=' || substr(md5(gen_random_uuid()::text), 1, 20), now() + interval '14 days')
    returning * into c;
  end if;
  return jsonb_build_object('ok', true, 'domain', v_dom, 'token', c.dns_token);
end $$;

create or replace function public.check_domain_dns(p_domain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  v_dom     text := lower(btrim(coalesce(p_domain, '')));
  c         domain_challenge;
  v_found   boolean;
  v_status  int;
  v_content text;
  v_hit     boolean := false;
  v_req     bigint;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into c from domain_challenge
   where user_id = uid and method = 'dns' and domain = v_dom and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then return public.v2_err('no_challenge'); end if;
  if to_regnamespace('net') is null then return public.v2_err('dns_unavailable'); end if;

  if c.dns_request_id is not null then
    execute 'select true, status_code, content from net._http_response where id = $1'
      into v_found, v_status, v_content using c.dns_request_id;
    if v_found is null then
      -- Still in flight. A lookup that never came back is fired again after 30 s.
      if c.dns_checked_at > now() - interval '30 seconds' then
        return jsonb_build_object('ok', true, 'pending', true);
      end if;
    else
      update domain_challenge set dns_request_id = null where id = c.id;
      if v_status = 200 then
        begin
          select exists (
            select 1 from jsonb_array_elements(coalesce(v_content::jsonb -> 'Answer', '[]'::jsonb)) a
             where position(c.dns_token in coalesce(a ->> 'data', '')) > 0) into v_hit;
        exception when others then v_hit := false;
        end;
      end if;
      if v_hit then
        insert into verified_domain (domain, verified_by, method) values (c.domain, uid, 'dns')
        on conflict (domain, verified_by) do nothing;
        delete from domain_challenge where id = c.id;
        return jsonb_build_object('ok', true, 'verified', true, 'domain', c.domain);
      end if;
      return public.v2_err(case when v_status = 200 then 'not_found' else 'dns_failed' end);
    end if;
  end if;

  execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := 5000)'
    into v_req
    using 'https://cloudflare-dns.com/dns-query?name=' || v_dom || '&type=TXT',
          jsonb_build_object('accept', 'application/dns-json');
  update domain_challenge set dns_request_id = v_req, dns_checked_at = now() where id = c.id;
  return jsonb_build_object('ok', true, 'pending', true);
end $$;

-- Domains the caller has a live DNS challenge for ("Claim pending · check DNS").
create or replace function public.my_pending_dns()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct domain), '{}') from domain_challenge
   where user_id = auth.uid() and method = 'dns' and expires_at > now();
$$;

-- ================================================================ claiming

create or replace function public.claim_board(p_board uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b   board;
  h   hub;
  d   text;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into b from board where id = p_board for update;
  if not found then return public.v2_err('not_found'); end if;
  if b.hub_id is not null then select * into h from hub where id = b.hub_id; end if;
  if h.claimed_at is not null then return public.v2_err('hub_claimed'); end if;
  if b.claimed_at is not null then return public.v2_err('claimed'); end if;
  d := public.v2_site_domain(b.site);
  if d is null then return public.v2_err('no_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  insert into membership (user_id, scope, scope_id, role) values (uid, 'board', b.id, 'owner')
  on conflict (user_id, scope, scope_id) do update set role = 'owner';
  update board set claimed_at = now() where id = b.id;
  perform public.v2_notify(uid, 'claim', null, 'board', b.id, null,
                           jsonb_build_object('scope', 'board', 'slug', b.slug, 'name', b.name));

  return jsonb_build_object('ok', true,
    -- FOUNDATION section 7: offer "Claim all of {hub}" when its primary domain is proved too.
    'hub', case when h.id is not null and h.claimed_at is null and public.v2_has_verified(h.primary_domain)
                then h.slug end);
end $$;

-- A hub claim covers every board in the hub (a hub membership covers its boards).
create or replace function public.claim_hub(p_hub uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h   hub;
  n   int;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into h from hub where id = p_hub for update;
  if not found then return public.v2_err('not_found'); end if;
  if h.claimed_at is not null then return public.v2_err('claimed'); end if;
  if h.primary_domain is null then return public.v2_err('no_domain'); end if;
  if not public.v2_has_verified(h.primary_domain) then return public.v2_err('not_verified'); end if;

  insert into membership (user_id, scope, scope_id, role) values (uid, 'hub', h.id, 'owner')
  on conflict (user_id, scope, scope_id) do update set role = 'owner';
  update hub set claimed_at = now() where id = h.id;
  update board set claimed_at = coalesce(claimed_at, now()) where hub_id = h.id;
  get diagnostics n = row_count;
  perform public.v2_notify(uid, 'claim', null, 'hub', h.id, null,
                           jsonb_build_object('scope', 'hub', 'slug', h.slug, 'name', h.name));
  return jsonb_build_object('ok', true, 'boards', n);
end $$;

-- ================================================================ join requests ("Work here?")

create or replace function public.request_join(p_scope public.v2_scope, p_scope_id uuid, p_work_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  d      text := public.v2_scope_domain(p_scope, p_scope_id);
  v_id   uuid;
  a      record;
  v_hub  uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.v2_scope_claimed(p_scope, p_scope_id) then return public.v2_err('not_claimed'); end if;
  if coalesce(public.is_scope_team(p_scope, p_scope_id, uid), false) then return public.v2_err('already_member'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  if d is null or not public.v2_domain_covers(d, split_part(v_mail, '@', 2)) then return public.v2_err('wrong_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  -- Requests expire after 14 days (mockup); a stale one makes way for a new one.
  update join_request set status = 'withdrawn'
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending'
     and created_at < now() - interval '14 days';
  select id into v_id from join_request
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'already', true); end if;

  insert into join_request (user_id, scope, scope_id, work_email) values (uid, p_scope, p_scope_id, v_mail)
  returning id into v_id;

  if p_scope = 'board' then select hub_id into v_hub from board where id = p_scope_id; end if;
  for a in select distinct user_id from membership
            where role in ('owner', 'admin')
              and ((scope = p_scope and scope_id = p_scope_id) or (scope = 'hub' and scope_id = v_hub)) loop
    perform public.v2_notify(a.user_id, 'join', uid, p_scope::text, p_scope_id, null,
                             jsonb_build_object('request', v_id, 'status', 'pending'));
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.decide_join_request(p_request uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   join_request;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into r from join_request where id = p_request for update;
  if not found then return public.v2_err('not_found'); end if;
  -- coalesce: is_scope_admin is null (not false) for someone with no role at all.
  if not coalesce(public.is_scope_admin(r.scope, r.scope_id), false) then return public.v2_err('not_allowed'); end if;
  if r.status <> 'pending' then return public.v2_err('decided'); end if;
  if r.created_at < now() - interval '14 days' then
    update join_request set status = 'withdrawn' where id = r.id;
    return public.v2_err('expired');
  end if;

  update join_request
     set status = case when p_approve then 'approved' else 'rejected' end::public.v2_request_status,
         decided_by = uid, decided_at = now()
   where id = r.id;
  if p_approve then
    insert into membership (user_id, scope, scope_id, role) values (r.user_id, r.scope, r.scope_id, 'member')
    on conflict (user_id, scope, scope_id) do nothing;
  end if;
  perform public.v2_notify(r.user_id, 'join', uid, r.scope::text, r.scope_id, null,
                           jsonb_build_object('request', r.id, 'status', case when p_approve then 'approved' else 'rejected' end));
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ team

-- Add an existing account by handle or email. They must be at the scope's domain:
-- their sign-in email is on it, or they have proved it themselves.
create or replace function public.add_team_member(p_scope public.v2_scope, p_scope_id uuid, p_who text,
                                                  p_role public.v2_role default 'member')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  mine   public.v2_role := public.v2_scope_role(p_scope, p_scope_id);
  who    text := lower(btrim(coalesce(p_who, '')));
  d      text := public.v2_scope_domain(p_scope, p_scope_id);
  target uuid;
  t_mail text;
  t_handle text;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if mine is null or mine = 'member' then return public.v2_err('not_allowed'); end if;
  if p_role = 'owner' and mine <> 'owner' then return public.v2_err('owners_only'); end if;
  if who = '' then return public.v2_err('not_found'); end if;

  if position('@' in who) > 1 then
    select u.id, lower(u.email) into target, t_mail from auth.users u where lower(u.email) = who;
  else
    select p.id into target from profile p where p.handle = ltrim(who, '@');
    select lower(u.email) into t_mail from auth.users u where u.id = target;
  end if;
  if target is null then return public.v2_err('not_found'); end if;
  if d is null or not (public.v2_domain_covers(d, split_part(coalesce(t_mail, ''), '@', 2))
                       or public.v2_has_verified(d, target)) then
    return public.v2_err('wrong_domain');
  end if;
  if exists (select 1 from membership where user_id = target and scope = p_scope and scope_id = p_scope_id) then
    return public.v2_err('already_member');
  end if;

  insert into membership (user_id, scope, scope_id, role) values (target, p_scope, p_scope_id, p_role);
  update join_request set status = 'approved', decided_by = uid, decided_at = now()
   where user_id = target and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  perform public.v2_notify(target, 'join', uid, p_scope::text, p_scope_id, null,
                           jsonb_build_object('status', 'added', 'role', p_role));
  select handle into t_handle from profile where id = target;
  return jsonb_build_object('ok', true, 'user_id', target, 'handle', t_handle);
end $$;

-- Change a role on this exact scope. Owners alone grant or take away "owner"; the
-- 0017 last-owner trigger refuses leaving a claimed scope without one.
create or replace function public.set_member_role(p_scope public.v2_scope, p_scope_id uuid, p_user uuid, p_role public.v2_role)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  mine public.v2_role := public.v2_scope_role(p_scope, p_scope_id);
  m    membership;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if mine is null or mine = 'member' then return public.v2_err('not_allowed'); end if;
  select * into m from membership where user_id = p_user and scope = p_scope and scope_id = p_scope_id for update;
  if not found then return public.v2_err('not_found'); end if;
  if (m.role = 'owner' or p_role = 'owner') and mine <> 'owner' then return public.v2_err('owners_only'); end if;
  if m.role = p_role then return jsonb_build_object('ok', true); end if;
  begin
    update membership set role = p_role where user_id = p_user and scope = p_scope and scope_id = p_scope_id;
  exception when check_violation then
    return public.v2_err('last_owner');
  end;
  return jsonb_build_object('ok', true);
end $$;

-- Remove someone (admins; owners only by owners) or leave yourself.
create or replace function public.remove_team_member(p_scope public.v2_scope, p_scope_id uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  mine public.v2_role := public.v2_scope_role(p_scope, p_scope_id);
  m    membership;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  select * into m from membership where user_id = p_user and scope = p_scope and scope_id = p_scope_id for update;
  if not found then return public.v2_err('not_found'); end if;
  if p_user <> uid then
    if mine is null or mine = 'member' then return public.v2_err('not_allowed'); end if;
    if m.role = 'owner' and mine <> 'owner' then return public.v2_err('owners_only'); end if;
  end if;
  begin
    delete from membership where user_id = p_user and scope = p_scope and scope_id = p_scope_id;
  exception when check_violation then
    return public.v2_err('last_owner');
  end;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ ownership disputes ("Report the wrong owner")

-- Filed by someone who proved the domain; decided by a platform admin (step 8),
-- never by the incumbent team, which cannot read it (0017 policy).
create or replace function public.open_dispute(p_scope public.v2_scope, p_scope_id uuid, p_reason text, p_work_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  v_mail text := lower(btrim(coalesce(p_work_email, '')));
  v_why  text := btrim(coalesce(p_reason, ''));
  d      text := public.v2_scope_domain(p_scope, p_scope_id);
  v_id   uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.v2_scope_claimed(p_scope, p_scope_id) then return public.v2_err('not_claimed'); end if;
  if coalesce(public.is_scope_team(p_scope, p_scope_id, uid), false) then return public.v2_err('already_member'); end if;
  if char_length(v_why) < 10 or char_length(v_why) > 2000 then return public.v2_err('reason_length'); end if;
  if v_mail !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then return public.v2_err('invalid_email'); end if;
  if d is null or not public.v2_domain_covers(d, split_part(v_mail, '@', 2)) then return public.v2_err('wrong_domain'); end if;
  if not public.v2_has_verified(d) then return public.v2_err('not_verified'); end if;

  select id into v_id from ownership_dispute
   where user_id = uid and scope = p_scope and scope_id = p_scope_id and status = 'pending';
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'already', true); end if;
  insert into ownership_dispute (user_id, scope, scope_id, reason, work_email)
  values (uid, p_scope, p_scope_id, v_why, v_mail) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ================================================================ grants

-- Write RPCs: signed-in callers only (each also checks auth.uid() itself).
do $$
declare f text;
begin
  foreach f in array array[
    'public.start_domain_email(text, text)',
    'public.verify_domain_email(text, text)',
    'public.start_domain_dns(text)',
    'public.check_domain_dns(text)',
    'public.my_pending_dns()',
    'public.claim_board(uuid)',
    'public.claim_hub(uuid)',
    'public.request_join(public.v2_scope, uuid, text)',
    'public.decide_join_request(uuid, boolean)',
    'public.add_team_member(public.v2_scope, uuid, text, public.v2_role)',
    'public.set_member_role(public.v2_scope, uuid, uuid, public.v2_role)',
    'public.remove_team_member(public.v2_scope, uuid, uuid)',
    'public.open_dispute(public.v2_scope, uuid, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Read helpers the UI may ask directly.
grant execute on function public.v2_scope_role(public.v2_scope, uuid, uuid),
                          public.is_scope_admin(public.v2_scope, uuid, uuid),
                          public.is_scope_team(public.v2_scope, uuid, uuid) to authenticated;
