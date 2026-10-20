-- ============================================================================
-- 0009: claim_product_board — fix D-008 / issue #22
-- ============================================================================
--
-- THE BUG
--
-- Claiming a product board did this from the browser:
--
--   await supabase.from('profiles')
--     .update({ role: 'maintainer', managed_org_id: ..., role_title: ... })
--     .eq('id', currentUser.id);
--
-- which fails with:
--
--   400 P0001 profiles.role cannot be changed by the owner
--
-- The BEFORE UPDATE trigger (0005) is CORRECT and must stay: without it any
-- signed-in user could self-promote to admin. The client was wrong to attempt
-- the write directly.
--
-- WHAT GOES WRONG IF WE JUST RELAX THE TRIGGER
--
--   * role elevation to 'maintainer' is a non-self-service action; letting a
--     client write it means anyone can claim any board by PATCHing the row
--   * managed_org_id is the entire basis of maintainer scoping — a client
--     could point it at any organization id, including one it does not own
--   * the verification input (work email / DNS TXT token) is supplied by the
--     caller; if the browser decides whether it passes, it never really
--     verified anything
--
-- THE FIX
--
-- One SECURITY DEFINER function that does the whole transition atomically and
-- decides verification server-side. The client sends evidence; the database
-- judges it. Nothing about the writer's trustworthiness is inferred from the
-- request.
--
-- DELIBERATE SCOPE LIMIT
--
-- Real ownership proof means an outbound email round-trip or a DNS lookup.
-- A database function can do neither. So this migration does NOT pretend to
-- verify anything: it enforces that the supplied work email matches the
-- product's website domain and records the claim as pending. A pending claim
-- grants NO elevated rights. Promotion to 'maintainer' requires a separate
-- action by an admin (or, later, a token-consumption function written by a
-- service that can actually check).
--
-- That is honest: the alternative shipped today is that the button 500s, so
-- nobody claims anything at all. This makes the request land, records the
-- evidence, and keeps privilege escalation gated.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Proof-of-claim state on the product.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists claim_status text not null default 'unclaimed';

alter table public.products
  add column if not exists claimed_by text;

alter table public.products
  add column if not exists claim_email text;

alter table public.products
  add column if not exists claim_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_claim_status_check'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_claim_status_check
      check (claim_status in ('unclaimed', 'pending', 'verified'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The claim itself.
-- ---------------------------------------------------------------------------

create or replace function public.claim_product_board(
  p_product_id text,
  p_work_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        text := auth.uid()::text;
  v_email      text := lower(trim(coalesce(p_work_email, '')));
  v_domain     text;
  v_site       text;
  v_site_host  text;
  v_status     text;
  v_claimed_by text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select claim_status, claimed_by
    into v_status, v_claimed_by
    from public.products
   where id = p_product_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  -- Already verified by someone else: refuse. Do not leak who.
  if v_status = 'verified' and coalesce(v_claimed_by, '') <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- The work email must plausibly belong to the product's own domain.
  -- This is a weak check and is labelled as such: it stops someone claiming
  -- Anthropic's board with an unrelated address, but it proves nothing about
  -- whether they can receive mail at that address.
  v_domain := split_part(v_email, '@', 2);

  select website_url into v_site from public.products where id = p_product_id;
  if v_site is not null and length(trim(v_site)) > 0 then
    v_site_host := lower(regexp_replace(v_site, '^https?://', ''));
    v_site_host := split_part(v_site_host, '/', 1);
    v_site_host := regexp_replace(v_site_host, '^www\.', '');
    -- accept the registrable domain or any subdomain of it
    if v_domain <> v_site_host and v_domain not like '%.' || v_site_host then
      return jsonb_build_object(
        'ok', false,
        'error', 'domain_mismatch',
        'expected', v_site_host
      );
    end if;
  end if;

  update public.products
     set claim_status       = case when v_status = 'verified' then 'verified' else 'pending' end,
         claimed_by         = v_uid,
         claim_email        = v_email,
         claim_requested_at = now()
   where id = p_product_id;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

revoke all on function public.claim_product_board(text, text) from public;
revoke all on function public.claim_product_board(text, text) from anon;
grant execute on function public.claim_product_board(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin-only promotion, so 'pending' can become 'verified'.
-- ---------------------------------------------------------------------------

create or replace function public.approve_product_claim(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        text := auth.uid()::text;
  v_is_admin   boolean;
  v_claimer    text;
  v_org        text;
begin
  select exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select claimed_by, org_id into v_claimer, v_org
    from public.products where id = p_product_id;

  if v_claimer is null then
    return jsonb_build_object('ok', false, 'error', 'no_pending_claim');
  end if;

  update public.products
     set claim_status = 'verified', is_verified = true
   where id = p_product_id;

  update public.organizations
     set is_verified = true
   where id = v_org;

  -- Elevation happens here, at approval time, not when the user asks.
  update public.profiles
     set role = case when role = 'admin' then 'admin' else 'maintainer' end,
         managed_org_id = v_org
   where id = v_claimer;

  return jsonb_build_object('ok', true, 'status', 'verified');
end;
$$;

revoke all on function public.approve_product_claim(text) from public;
revoke all on function public.approve_product_claim(text) from anon;
grant execute on function public.approve_product_claim(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Products keep their existing public-read / authenticated-write posture.
--    The new columns ride along; no policy change is needed because claim
--    writes go through the SECURITY DEFINER functions above, not direct
--    UPDATEs.
--
--    NOTE ON EXECUTE GRANTS: Supabase grants EXECUTE on new functions to
--    anon, authenticated and service_role by default. `revoke ... from public`
--    does NOT remove a grant made to a named role, so anon is revoked
--    explicitly above. Verified against proacl:
--
--      before: {postgres=X, anon=X, authenticated=X, service_role=X}
--      after:  {postgres=X, authenticated=X, service_role=X}
-- ---------------------------------------------------------------------------

commit;
