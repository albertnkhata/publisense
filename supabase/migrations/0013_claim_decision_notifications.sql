-- Tell the claimant what was decided.
--
-- Until now a claim decision was silent. An approval or refusal changed rows that
-- the claimant could only notice by revisiting the board, so a declined request
-- simply sat in the dark — which is the worst outcome for the person who asked,
-- because "no answer" and "no" look identical from their side.
--
-- The notification is written inside the same SECURITY DEFINER function that makes
-- the decision, so the two can never disagree: there is no code path that approves
-- a claim without telling the claimant, and none that tells them about a decision
-- that was then refused.
--
-- notifications has RLS with read/update policies for the recipient and no insert
-- policy, so rows can only be written from here (or with the service role). The
-- claimant can mark it read; they cannot create one.

-- notifications.kind is a checked list, and it did not include the two kinds this
-- migration needs. Extending it here rather than silently reusing 'upvote' keeps
-- the database telling the truth about what a row means.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'upvote', 'comment', 'status_change', 'repost', 'follow',
    'claim_approved', 'claim_rejected'
  ]));

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
  v_name       text;
begin
  select exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select claimed_by, org_id, claim_status, name
    into v_claimer, v_org, v_status, v_name
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

  insert into public.notifications (recipient_id, actor_id, product_id, kind, title, message)
  values (
    v_claimer, v_uid, p_product_id, 'claim_approved',
    'Your claim on ' || coalesce(v_name, 'a board') || ' was approved',
    'You are now a maintainer of this board and can respond to feedback officially.'
  );

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
  v_uid       text := auth.uid()::text;
  v_is_admin  boolean;
  v_status    text;
  v_email     text;
  v_claimer   text;
  v_name      text;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
begin
  select exists (
    select 1 from public.profiles p
     where p.id = v_uid and p.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select claim_status, claimed_by, name into v_status, v_claimer, v_name
    from public.products where id = p_product_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;

  -- Only a pending claim can be refused. 'verified' is not reversible here:
  -- taking a board away from a real maintainer is a different, larger decision.
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
  values (p_product_id, 'rejected', v_uid, v_email, v_note);

  -- The note is the reviewer's reason, so it goes to the person it is about.
  -- Leaving it out would make the notification "we said no", which is exactly the
  -- silence this change exists to end.
  if v_claimer is not null then
    insert into public.notifications (recipient_id, actor_id, product_id, kind, title, message)
    values (
      v_claimer, v_uid, p_product_id, 'claim_rejected',
      'Your claim on ' || coalesce(v_name, 'a board') || ' was not approved',
      case
        when v_note is not null then 'Reason given: ' || v_note
        else 'The board stays open and can be claimed again with a work email that matches its domain.'
      end
    );
  end if;

  return jsonb_build_object('ok', true, 'status', 'unclaimed');
end;
$function$;
