-- 0031: staff can correct or remove a seeded post.
-- A seeded post (0028) has no author, so the author edit and delete policies (0017)
-- never match it and nobody could fix a typo, a wrong source link or a wrong date.
-- edit_seeded_post changes type, title, details, source link and original date;
-- delete_seeded_post removes it. Both are platform-admin only and touch only posts
-- with no author, so they can never be used on a person's post.

create or replace function public.edit_seeded_post(
  p_post       uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_source_url text,
  p_posted_at  timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  p       post;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_body  text := btrim(coalesce(p_body, ''));
  v_url   text := btrim(coalesce(p_source_url, ''));
  v_type  text := lower(btrim(coalesce(p_type, '')));
  v_at    timestamptz;
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  select * into p from post where id = p_post for update;
  if not found or p.author_id is not null or p.source_url is null then return public.v2_err('not_found'); end if;
  if v_type not in ('bug', 'feature') then return public.v2_err('invalid_type'); end if;
  if char_length(v_title) not between 3 and 140 then return public.v2_err('title_length'); end if;
  if char_length(v_body) > 10000 then return public.v2_err('body_length'); end if;
  if v_url !~ '^https://[^\s/]+\.[^\s/]+' or char_length(v_url) > 2000 then return public.v2_err('invalid_source'); end if;
  v_at := coalesce(p_posted_at, p.created_at);
  if v_at > now() + interval '5 minutes' or v_at < timestamptz '2000-01-01' then return public.v2_err('invalid_date'); end if;
  if exists (select 1 from post where board_id = p.board_id and source_url = v_url and id <> p.id) then
    return public.v2_err('duplicate');
  end if;

  update post
     set type = v_type::v2_post_type, title = v_title, body = v_body, source_url = v_url,
         created_at = least(v_at, now()),
         edited_at = case when (type::text, title, body) is distinct from (v_type, v_title, v_body) then now() else edited_at end
   where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id);
end $$;

create or replace function public.delete_seeded_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not public.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  delete from post where id = p_post and author_id is null and source_url is not null;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.edit_seeded_post(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.edit_seeded_post(uuid, text, text, text, text, timestamptz) to authenticated;
revoke execute on function public.delete_seeded_post(uuid) from public, anon;
grant execute on function public.delete_seeded_post(uuid) to authenticated;
