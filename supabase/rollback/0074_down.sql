-- Rollback for 0074_v2_search_source_author.sql.
-- Restores public.post.search to title (A) + body (B) only and removes the
-- source_author index.

drop index if exists public.post_source_author_lower_idx;
alter table public.post drop column if exists search;

alter table public.post
  add column search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

create index if not exists post_search_idx on public.post using gin (search);
