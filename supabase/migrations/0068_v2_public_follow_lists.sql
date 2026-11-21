-- 0068_v2_public_follow_lists.sql
-- Public profile follower and following lists (people + live products/hubs).
--
-- Keeps public.follow RLS private (target = 'post' notification follows stay private)
-- while exposing read-only social graphs for /u/:handle:
--   - profile_following_count(p_user): people + live boards + live hubs followed
--   - profile_followers(p_user, p_limit): people following p_user
--   - profile_following_users(p_user, p_limit): people followed by p_user
--   - profile_following_scopes(p_user, p_limit): live boards and hubs followed by p_user

create or replace function public.profile_following_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*)::int
       from public.follow f
       join public.profile p on p.id = f.target_id
      where f.user_id = p_user and f.target = 'user')
    +
    (select count(*)::int
       from public.follow f
       join public.board b on b.id = f.target_id
      where f.user_id = p_user and f.target = 'board' and b.status = 'live')
    +
    (select count(*)::int
       from public.follow f
       join public.hub h on h.id = f.target_id
      where f.user_id = p_user and f.target = 'hub' and h.status = 'live')
  );
$$;

create or replace function public.profile_followers(p_user uuid, p_limit int default 100)
returns table (
  id uuid,
  handle text,
  name text,
  avatar_path text,
  bio text,
  follower_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.name, p.avatar_path, p.bio, p.follower_count
    from public.follow f
    join public.profile p on p.id = f.user_id
   where f.target = 'user'
     and f.target_id = p_user
   order by f.created_at desc, p.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.profile_following_users(p_user uuid, p_limit int default 100)
returns table (
  id uuid,
  handle text,
  name text,
  avatar_path text,
  bio text,
  follower_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.name, p.avatar_path, p.bio, p.follower_count
    from public.follow f
    join public.profile p on p.id = f.target_id
   where f.user_id = p_user
     and f.target = 'user'
   order by f.created_at desc, p.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.profile_following_scopes(p_user uuid, p_limit int default 100)
returns table (
  scope text,
  id uuid,
  slug text,
  name text,
  color text,
  logo_path text,
  follower_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select x.scope, x.id, x.slug, x.name, x.color, x.logo_path, x.follower_count
    from (
      select 'board'::text as scope, b.id, b.slug, b.name, b.color, b.logo_path, b.follower_count, f.created_at
        from public.follow f
        join public.board b on b.id = f.target_id
       where f.user_id = p_user
         and f.target = 'board'
         and b.status = 'live'
      union all
      select 'hub'::text as scope, h.id, h.slug, h.name, ''::text as color, null::text as logo_path, h.follower_count, f.created_at
        from public.follow f
        join public.hub h on h.id = f.target_id
       where f.user_id = p_user
         and f.target = 'hub'
         and h.status = 'live'
    ) x
   order by x.created_at desc, x.name
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke execute on function
  public.profile_following_count(uuid),
  public.profile_followers(uuid, int),
  public.profile_following_users(uuid, int),
  public.profile_following_scopes(uuid, int)
  from public;

grant execute on function
  public.profile_following_count(uuid),
  public.profile_followers(uuid, int),
  public.profile_following_users(uuid, int),
  public.profile_following_scopes(uuid, int)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
