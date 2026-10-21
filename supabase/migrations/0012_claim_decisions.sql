-- Claim decisions: give refusals a path, and give both outcomes a record.
--
-- Two gaps this closes.
--
-- 1. There was no reject at all. approve_product_claim() existed, so a claim could
--    be granted — but a bad claim could only be approved or ignored forever. A
--    request that is never going to be honoured sat in the queue with no way to
--    clear it and no way to tell the requester anything.
--
-- 2. Neither outcome left a trace. Approving wrote state onto products,
--    organizations and profiles, and nothing recorded who did it or when. For a
--    process that hands out maintainer rights over somebody else's product board,
--    "it happened, trust us" is not an audit trail.
--
-- The rejection resets the claim to 'unclaimed' rather than introducing a
-- 'rejected' status. That is deliberate: the products.claim_status check
-- constraint allows unclaimed|pending|verified, and a terminal 'rejected' state
-- would need cooldown and re-request rules that nobody has designed yet. Resetting
-- lets the board be claimed again — by the same person or another — while the
-- claim_decisions row preserves the fact that the first attempt was refused.
--
-- Repeated approval now returns already_verified instead of succeeding quietly.
-- It was idempotent before (it re-applied the same role and re-flipped the same
-- flags), but with an audit table "approved twice" would write two rows for one
-- decision, so the second call is refused instead.

create table if not exists public.claim_decisions (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references public.products(id) on delete cascade,
  action        text not null check (action in ('approved', 'rejected')),
  actor_id      text,
  actor_email   text,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists claim_decisions_product_idx
  on public.claim_decisions (product_id, created_at desc);

alter table public.claim_decisions enable row level security;

-- Readable by administrators only. There is deliberately no insert/update/delete
-- policy: rows are written inside the SECURITY DEFINER functions below, so nobody
-- can forge or erase a decision through the REST API.
drop policy if exists "claim decisions admin read" on public.claim_decisions;
create policy "claim decisions admin read" on public.claim_decisions
  for select using (public.is_admin());


create or replace function public.approve_product_claim(p_product_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid        text := auth.uid()::text;
  v_is_admin   boolean;
  v_claimer    text;
  v_org        text;
  v_status     text;
  v_email      text;
begin
  select exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select claimed_by, org_id, claim_status into v_claimer, v_org, v_status
    from public.products where id = p_product_id;

  if v_claimer is null then
    return jsonb_build_object('ok', false, 'error', 'no_pending_claim');
  end if;

  if v_status = 'verified' then
    return jsonb_build_object('ok', false, 'error', 'already_verified');
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

  select email into v_email from public.profiles where id = v_uid;

  insert into public.claim_decisions (product_id, action, actor_id, actor_email)
  values (p_product_id, 'approved', v_uid, v_email);

  return jsonb_build_object('ok', true, 'status', 'verified');
end;
$function$;


create or replace function public.reject_product_claim(
  p_product_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid      text := auth.uid()::text;
  v_is_admin boolean;
  v_status   text;
  v_email    text;
begin
  select exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select claim_status into v_status from public.products where id = p_product_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  -- Only a pending claim can be refused. 'verified' is not reversible here: taking
  -- a board away from a real maintainer is a different, larger decision.
  if v_status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'error', 'no_pending_claim');
  end if;

  update public.products
     set claim_status = 'unclaimed',
         claimed_by = null,
         claim_email = null,
         claim_requested_at = null
   where id = p_product_id;

  select email into v_email from public.profiles where id = v_uid;

  insert into public.claim_decisions (product_id, action, actor_id, actor_email, note)
  values (p_product_id, 'rejected', v_uid, v_email, nullif(trim(coalesce(p_note, '')), ''));

  return jsonb_build_object('ok', true, 'status', 'unclaimed');
end;
$function$;


-- These two hand out and revoke maintainer rights; they are for signed-in users,
-- not for anyone holding the anon key.
revoke all on function public.approve_product_claim(text) from anon;
revoke all on function public.reject_product_claim(text, text) from anon;
grant execute on function public.approve_product_claim(text) to authenticated;
grant execute on function public.reject_product_claim(text, text) to authenticated;
