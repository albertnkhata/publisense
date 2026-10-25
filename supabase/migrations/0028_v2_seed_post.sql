-- 0028: staff can seed a post from a public source.
-- A seeded post has no author and a source_url (0016), and renders as the board's
-- own card with "from GitHub / Reddit / X" linking back. Until now only migrations
-- could write one. seed_post lets a platform admin add one from the composer.
--
-- It runs as definer, so the client-insert trigger (which forces author_id,
-- clears source_url and stamps now()) does not apply. The original posting date
-- may be given, so a seeded thread sorts where it really happened.
-- One source link seeds at most one post per board.

create or replace function public.seed_post(
  p_board      uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_source_url text,
  p_posted_at  timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  b       board;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_body  text := btrim(coalesce(p_body, ''));
  v_url   text := btrim(coalesce(p_source_url, ''));
  v_type  text := lower(btrim(coalesce(p_type, '')));
  v_at    timestamptz := coalesce(p_posted_at, now());
  v_id    uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board;
  if not found or b.status <> 'live' then return public.v2_err('not_found'); end if;
  if v_type not in ('bug', 'feature') then return public.v2_err('invalid_type'); end if;
  if char_length(v_title) not between 3 and 140 then return public.v2_err('title_length'); end if;
  if char_length(v_body) > 10000 then return public.v2_err('body_length'); end if;
  if v_url !~ '^https://[^\s/]+\.[^\s/]+' or char_length(v_url) > 2000 then return public.v2_err('invalid_source'); end if;
  if v_at > now() + interval '5 minutes' or v_at < timestamptz '2000-01-01' then return public.v2_err('invalid_date'); end if;

  select id into v_id from post where board_id = b.id and source_url = v_url limit 1;
  if v_id is not null then return public.v2_err('duplicate', jsonb_build_object('id', v_id)); end if;

  insert into post (board_id, author_id, source_url, type, title, body, created_at)
  values (b.id, null, v_url, v_type::v2_post_type, v_title, v_body, least(v_at, now()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke execute on function public.seed_post(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.seed_post(uuid, text, text, text, text, timestamptz) to authenticated;
