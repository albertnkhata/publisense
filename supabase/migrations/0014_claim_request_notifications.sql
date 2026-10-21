-- A claim request now arrives somewhere.
--
-- Claiming was the last silent step in the claim flow: the claimant submitted a
-- work email, the board went to 'pending', and then nothing was said to anyone.
-- The requester had no acknowledgement that it had been received, and the only
-- way an administrator found out was by opening Settings and looking. The decision
-- notifications added earlier tell people the outcome of a review — this tells them
-- the request exists.
--
-- Two rows per new request:
--   * the claimant gets 'claim_requested', so submitting is not a void,
--   * every admin gets 'claim_pending', so a request does not wait on someone
--     happening to visit the review screen.
--
-- Only a genuinely new request fans out to admins. Re-submitting the same pending
-- claim (same claimant) updates the work email without paging every admin again,
-- and refused attempts (bad email, wrong domain, already verified) insert nothing
-- because they return before this point.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'upvote', 'comment', 'status_change', 'repost', 'follow',
    'claim_approved', 'claim_rejected', 'claim_requested', 'claim_pending'
  ]));

create or replace function public.claim_product_board(p_product_id text, p_work_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid         text := auth.uid()::text;
  v_email       text := lower(trim(coalesce(p_work_email, '')));
  v_domain      text;
  v_site        text;
  v_site_host   text;
  v_status      text;
  v_claimed_by  text;
  v_name        text;
  v_handle      text;
  v_is_new      boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select claim_status, claimed_by, name
    into v_status, v_claimed_by, v_name
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

  -- A repeat submission by the same claimant is not new work for an admin.
  v_is_new := v_claimed_by is null or v_claimed_by <> v_uid;

  update public.products
     set claim_status       = case when v_status = 'verified' then 'verified' else 'pending' end,
         claimed_by         = v_uid,
         claim_email        = v_email,
         claim_requested_at = now()
   where id = p_product_id;

  select handle into v_handle from public.profiles where id = v_uid;

  insert into public.notifications (recipient_id, actor_id, product_id, kind, title, message)
  values (
    v_uid, v_uid, p_product_id, 'claim_requested',
    'Claim received for ' || coalesce(v_name, 'a board'),
    'Reviews are done by a person, so there is no fixed turnaround. You will be told here when a decision is made.'
  );

  if v_is_new then
    insert into public.notifications (recipient_id, actor_id, product_id, kind, title, message)
    select
      a.id,
      v_uid,
      p_product_id,
      'claim_pending',
      'Claim waiting: ' || coalesce(v_name, 'a board'),
      coalesce(v_handle, 'Someone') || ' asked to claim this board with '
        || v_email || '. Review it in Settings.'
    from public.profiles a
    -- Only admins who can actually sign in. The seeded demo data carries an admin
    -- profile with no auth user, and paging an account nobody can open just
    -- buries the requests that a real person needs to see.
    join auth.users u on u.id::text = a.id
    where a.role = 'admin'
      and a.id <> v_uid;
  end if;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$function$;

-- Claiming is for signed-in users only; it was callable with the anon key before.
revoke all on function public.claim_product_board(text, text) from anon;
grant execute on function public.claim_product_board(text, text) to authenticated;
