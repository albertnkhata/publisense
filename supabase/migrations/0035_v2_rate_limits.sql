-- 0035: rate limits on the three things anyone signed in can write directly:
-- posts, replies and upvotes. Before this only adding products, companies and
-- claim codes were throttled, so one account (or a script holding its token)
-- could flood a board. A BEFORE INSERT trigger counts the writer's own recent
-- rows and refuses with SQLSTATE PT429, which PostgREST returns as HTTP 429.
--
-- Limits (per account):        10 minutes   24 hours
--   post                            5           20
--   reply                          20          100
--   vote                           60          300
--
-- Server-side inserts with no signed-in user (auth.uid() is null) and platform
-- admins (seeding imports) are exempt.

create index if not exists post_author_created_idx  on public.post  (author_id, created_at) where author_id is not null;
create index if not exists reply_author_created_idx on public.reply (author_id, created_at) where author_id is not null;
create index if not exists vote_user_created_idx    on public.vote  (user_id, created_at);

create or replace function public.v2_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  short_n int;
  day_n   int;
  short_max int;
  day_max   int;
  what    text;
begin
  if uid is null or public.is_platform_admin(uid) then return new; end if;

  if tg_table_name = 'post' then
    short_max := 5;  day_max := 20;  what := 'posts';
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
      into short_n, day_n from post where author_id = uid and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'reply' then
    short_max := 20; day_max := 100; what := 'replies';
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
      into short_n, day_n from reply where author_id = uid and created_at > now() - interval '24 hours';
  else
    short_max := 60; day_max := 300; what := 'upvotes';
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
      into short_n, day_n from vote where user_id = uid and created_at > now() - interval '24 hours';
  end if;

  if short_n >= short_max then
    raise exception 'rate_limited' using errcode = 'PT429', detail = what, hint = 'short';
  end if;
  if day_n >= day_max then
    raise exception 'rate_limited' using errcode = 'PT429', detail = what, hint = 'day';
  end if;
  return new;
end $$;

revoke all on function public.v2_rate_limit() from public, anon, authenticated;

drop trigger if exists post_rate_limit on public.post;
create trigger post_rate_limit before insert on public.post
  for each row execute function public.v2_rate_limit();

drop trigger if exists reply_rate_limit on public.reply;
create trigger reply_rate_limit before insert on public.reply
  for each row execute function public.v2_rate_limit();

drop trigger if exists vote_rate_limit on public.vote;
create trigger vote_rate_limit before insert on public.vote
  for each row execute function public.v2_rate_limit();
