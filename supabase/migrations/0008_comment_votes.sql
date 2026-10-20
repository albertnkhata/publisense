-- ============================================================================
-- 0008: comment_votes — fix D-009 / issue #22
-- ============================================================================
-- Problem
-- -------
-- Comment upvoting was a client-side counter update:
--
--   UPDATE comments SET likes_count = <client-computed value> WHERE id = ...
--
-- The only UPDATE policy on `comments` is "comments author update"
-- (auth.uid() = author_id). A non-author upvoting someone else's workaround
-- therefore matched ZERO rows — and PostgREST returns HTTP 200 with zero rows
-- affected rather than an error. The UI showed success while persisting
-- nothing.
--
-- Solution
-- --------
-- Mirror post_votes, which already works:
--   * `comment_votes` — one row per (comment, voter). Uniqueness is the
--     primary key, so "one vote per user" is enforced by the database rather
--     than by a client-side check.
--   * `likes_count` becomes a cache maintained by a trigger, so it stays
--     consistent no matter which path writes a vote. Clients no longer send
--     a count at all.
--
-- Existing `likes_count` values are seed data with no corresponding voters.
-- They are preserved as a baseline rather than reset to zero; the trigger
-- adjusts from whatever it finds.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The votes table
-- ---------------------------------------------------------------------------
create table if not exists public.comment_votes (
  comment_id text not null references public.comments(id) on delete cascade,
  user_id    text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_comment_votes_comment
  on public.comment_votes(comment_id);

alter table public.comment_votes enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Policies — public read, own row only.
--    Same shape as post_votes. No UPDATE policy: a vote is present or absent,
--    never edited, so INSERT and DELETE cover every legitimate operation.
-- ---------------------------------------------------------------------------
drop policy if exists "comment votes read public" on public.comment_votes;
create policy "comment votes read public" on public.comment_votes
  for select using (true);

drop policy if exists "comment votes self insert" on public.comment_votes;
create policy "comment votes self insert" on public.comment_votes
  for insert to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists "comment votes self delete" on public.comment_votes;
create policy "comment votes self delete" on public.comment_votes
  for delete to authenticated
  using (auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- 3. Keep comments.likes_count in step with the votes that exist.
--
--    SECURITY DEFINER so the counter update is not itself blocked by the
--    author-only UPDATE policy on `comments` — that constraint is what broke
--    voting in the first place. search_path is pinned so the definer context
--    cannot be redirected.
--
--    NOTE: every table reference below is fully qualified (public.comments),
--    matching 0004 and 0007. Pinning search_path to a fixed schema while
--    leaving references unqualified means the function silently operates on
--    whatever happens to live in that schema — which is how an earlier draft
--    of this migration wrote to the live table from inside a test schema.
-- ---------------------------------------------------------------------------
create or replace function public.sync_comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_comment text;
  delta          integer;
begin
  if tg_op = 'INSERT' then
    target_comment := new.comment_id;
    delta := 1;
  else
    target_comment := old.comment_id;
    delta := -1;
  end if;

  -- Set before the guarded update and cleared immediately after, so the guard
  -- trigger can tell this derived write apart from a client-supplied one.
  perform set_config('publisense.likes_sync', 'on', true);

  update public.comments
     set likes_count = greatest(0, likes_count + delta)
   where id = target_comment;

  perform set_config('publisense.likes_sync', '', true);

  return null;
end;
$$;

drop trigger if exists trg_sync_comment_likes_count on public.comment_votes;
create trigger trg_sync_comment_likes_count
  after insert or delete on public.comment_votes
  for each row execute function public.sync_comment_likes_count();

-- ---------------------------------------------------------------------------
-- 4. Stop clients writing likes_count directly.
--
--    Without this, the old client code (update comments set likes_count = N)
--    would still silently do nothing for non-authors — a confusing failure
--    rather than a clear one — and for authors it would desync the count from
--    the vote rows. Reject it explicitly so the mistake is loud.
--
--    The sync trigger above is a SECURITY DEFINER function, so it runs as the
--    function owner. `current_user` therefore reports the owner inside it, not
--    the caller, and cannot be used to distinguish the two. Instead the sync
--    trigger sets a transaction-local flag around its own UPDATE; anything
--    that changes likes_count without that flag is a client write.
-- ---------------------------------------------------------------------------
create or replace function public.guard_comment_likes_count()
returns trigger
language plpgsql
as $$
begin
  if new.likes_count is distinct from old.likes_count
     and coalesce(current_setting('publisense.likes_sync', true), '') <> 'on'
  then
    raise exception
      'comments.likes_count is derived from comment_votes and cannot be written directly'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_comment_likes_count on public.comments;
create trigger trg_guard_comment_likes_count
  before update on public.comments
  for each row execute function public.guard_comment_likes_count();

-- ---------------------------------------------------------------------------
-- 5. Backfill: seed votes for the existing fabricated counts?
--
--    No. The seeded likes_count values (42, 40, ...) have no voters behind
--    them and cannot be attributed to real users. They are left as a baseline
--    that future real votes adjust, rather than inventing vote rows that would
--    misrepresent who voted.
-- ---------------------------------------------------------------------------

commit;
