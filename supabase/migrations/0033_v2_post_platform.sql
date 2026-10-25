-- 0033: a post can say which device it is about: iOS, Android, Web or Desktop.
-- Optional, and mostly useful for bugs. Authors set it in the composer and may change
-- it when they edit; staff set it on seeded posts. Boards filter by it.

alter table public.post add column if not exists platform text
  check (platform is null or platform in ('ios', 'android', 'web', 'desktop'));
create index if not exists post_board_platform_idx on public.post (board_id, platform) where platform is not null;

grant insert (platform) on public.post to authenticated;
grant update (platform) on public.post to authenticated;

drop function if exists public.seed_post(uuid, text, text, text, text, timestamptz, text);
drop function if exists public.edit_seeded_post(uuid, text, text, text, text, timestamptz, text);

create or replace function public.seed_post(
  p_board      uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_source_url text,
  p_posted_at  timestamptz default null,
  p_source_author text default null,
  p_platform   text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  b       board;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_body  text := btrim(coalesce(p_body, ''));
  v_url   text := btrim(coalesce(p_source_url, ''));
  v_type  text := lower(btrim(coalesce(p_type, '')));
  v_plat  text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_who   text := nullif(btrim(regexp_replace(coalesce(p_source_author, ''), '\s+', ' ', 'g')), '');
  v_at    timestamptz := coalesce(p_posted_at, now());
  v_id    uuid;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into b from board where id = p_board;
  if not found or b.status not in ('live', 'pending') then return public.v2_err('not_found'); end if;
  if v_type not in ('bug', 'feature') then return public.v2_err('invalid_type'); end if;
  if char_length(v_title) not between 3 and 140 then return public.v2_err('title_length'); end if;
  if char_length(v_body) > 10000 then return public.v2_err('body_length'); end if;
  if v_plat is not null and v_plat not in ('ios', 'android', 'web', 'desktop') then return public.v2_err('invalid_platform'); end if;
  if char_length(v_who) > 80 then return public.v2_err('author_length'); end if;
  if v_url !~ '^https://[^\s/]+\.[^\s/]+' or char_length(v_url) > 2000 then return public.v2_err('invalid_source'); end if;
  if v_at > now() + interval '5 minutes' or v_at < timestamptz '2000-01-01' then return public.v2_err('invalid_date'); end if;

  select id into v_id from post where board_id = b.id and source_url = v_url limit 1;
  if v_id is not null then return public.v2_err('duplicate', jsonb_build_object('id', v_id)); end if;

  insert into post (board_id, author_id, source_url, source_author, platform, type, title, body, created_at)
  values (b.id, null, v_url, v_who, v_plat, v_type::v2_post_type, v_title, v_body, least(v_at, now()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.edit_seeded_post(
  p_post       uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_source_url text,
  p_posted_at  timestamptz default null,
  p_source_author text default null,
  p_platform   text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  p       post;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_body  text := btrim(coalesce(p_body, ''));
  v_url   text := btrim(coalesce(p_source_url, ''));
  v_type  text := lower(btrim(coalesce(p_type, '')));
  v_plat  text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_who   text := nullif(btrim(regexp_replace(coalesce(p_source_author, ''), '\s+', ' ', 'g')), '');
  v_at    timestamptz;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into p from post where id = p_post for update;
  if not found or p.author_id is not null or p.source_url is null then return public.v2_err('not_found'); end if;
  if v_type not in ('bug', 'feature') then return public.v2_err('invalid_type'); end if;
  if char_length(v_title) not between 3 and 140 then return public.v2_err('title_length'); end if;
  if char_length(v_body) > 10000 then return public.v2_err('body_length'); end if;
  if v_plat is not null and v_plat not in ('ios', 'android', 'web', 'desktop') then return public.v2_err('invalid_platform'); end if;
  if char_length(v_who) > 80 then return public.v2_err('author_length'); end if;
  if v_url !~ '^https://[^\s/]+\.[^\s/]+' or char_length(v_url) > 2000 then return public.v2_err('invalid_source'); end if;
  v_at := coalesce(p_posted_at, p.created_at);
  if v_at > now() + interval '5 minutes' or v_at < timestamptz '2000-01-01' then return public.v2_err('invalid_date'); end if;
  if exists (select 1 from post where board_id = p.board_id and source_url = v_url and id <> p.id) then
    return public.v2_err('duplicate');
  end if;

  update post
     set type = v_type::v2_post_type, title = v_title, body = v_body, source_url = v_url, source_author = v_who, platform = v_plat,
         created_at = least(v_at, now()),
         edited_at = case when (type::text, title, body) is distinct from (v_type, v_title, v_body) then now() else edited_at end
   where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id);
end $$;

revoke execute on function public.seed_post(uuid, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.seed_post(uuid, text, text, text, text, timestamptz, text, text) to authenticated;
revoke execute on function public.edit_seeded_post(uuid, text, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.edit_seeded_post(uuid, text, text, text, text, timestamptz, text, text) to authenticated;
