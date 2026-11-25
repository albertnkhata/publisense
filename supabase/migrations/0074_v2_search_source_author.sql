-- 0074: Index seeded post source_author / credited handles in post.search.
--
-- Seeded posts store their credited handle in public.post.source_author
-- (e.g. '@jeff_weinstein', '@ChaseMc67', 'u/Gokuseens', 'u/MarcN-Apps').
-- Previously public.post.search only indexed title (A) and body (B), so
-- credited authors could not find their posts by handle in Cmd+K or /search.
--
-- Rebuilds the stored generated tsvector column to include source_author both
-- verbatim and with any leading '@' or 'u/' stripped, indexed with both
-- 'english' (matching websearch_to_tsquery('english', ...)) and 'simple'
-- (preserving handles that collide with English stopwords).
-- Rollback: supabase/rollback/0074_down.sql.

alter table public.post drop column if exists search;

alter table public.post
  add column search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(source_author, '') || ' ' ||
        regexp_replace(coalesce(source_author, ''), '^(@|u/)', '', 'i')
      ),
      'C'
    ) ||
    setweight(
      to_tsvector(
        'simple',
        coalesce(source_author, '') || ' ' ||
        regexp_replace(coalesce(source_author, ''), '^(@|u/)', '', 'i')
      ),
      'C'
    )
  ) stored;

create index if not exists post_search_idx on public.post using gin (search);
create index if not exists post_source_author_lower_idx
  on public.post (lower(source_author))
  where source_author is not null;
