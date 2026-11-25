-- Credited handle search (0074): seeded posts' source_author is indexed in
-- public.post.search both with and without leading '@' or 'u/'. Runs inside a
-- rolled-back transaction with its own fixtures.

\set ON_ERROR_STOP 1
begin;
set local statement_timeout = '60s';

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

create temp table f as
  select gen_random_uuid() as hub,
         gen_random_uuid() as board,
         gen_random_uuid() as p_x,
         gen_random_uuid() as p_x_single,
         gen_random_uuid() as p_reddit,
         gen_random_uuid() as p_hyphen;

insert into public.hub (id, slug, name, status)
  select hub, 'search-credit-hub-' || left(hub::text, 8), 'Search Credit Hub', 'live' from f;

insert into public.board (id, hub_id, slug, name, status)
  select board, hub, 'search-credit-board-' || left(board::text, 8), 'Search Credit Board', 'live' from f;

insert into public.post (id, board_id, author_id, source_url, source_author, type, title, body)
select p_x, board, null::uuid, 'https://x.com/jeff_weinstein/status/1', '@jeff_weinstein', 'feature'::public.v2_post_type,
       'Stripe Checkout invoice export', 'Need a CSV button.' from f
union all
select p_x_single, board, null::uuid, 'https://x.com/ChaseMc67/status/2', '@ChaseMc67', 'bug'::public.v2_post_type,
       'Tab switcher freezes on wake', 'Happens after sleep.' from f
union all
select p_reddit, board, null::uuid, 'https://www.reddit.com/r/app/comments/3', 'u/Gokuseens', 'friction'::public.v2_post_type,
       'Onboarding tooltip blocks toolbar', 'Hard to dismiss.' from f
union all
select p_hyphen, board, null::uuid, 'https://www.reddit.com/r/app/comments/4', 'u/MarcN-Apps', 'feature'::public.v2_post_type,
       'Keyboard navigation for settings', 'Arrows would help.' from f;

select pg_temp.expect(
  'matches @jeff_weinstein with @',
  exists (select 1 from public.post p, f where p.id = f.p_x and p.search @@ websearch_to_tsquery('english', '@jeff_weinstein'))
);
select pg_temp.expect(
  'matches jeff_weinstein without @',
  exists (select 1 from public.post p, f where p.id = f.p_x and p.search @@ websearch_to_tsquery('english', 'jeff_weinstein'))
);
select pg_temp.expect(
  'matches @ChaseMc67 with @',
  exists (select 1 from public.post p, f where p.id = f.p_x_single and p.search @@ websearch_to_tsquery('english', '@ChaseMc67'))
);
select pg_temp.expect(
  'matches ChaseMc67 without @',
  exists (select 1 from public.post p, f where p.id = f.p_x_single and p.search @@ websearch_to_tsquery('english', 'ChaseMc67'))
);
select pg_temp.expect(
  'matches u/Gokuseens with u/ prefix',
  exists (select 1 from public.post p, f where p.id = f.p_reddit and p.search @@ websearch_to_tsquery('english', 'u/Gokuseens'))
);
select pg_temp.expect(
  'matches Gokuseens without u/ prefix',
  exists (select 1 from public.post p, f where p.id = f.p_reddit and p.search @@ websearch_to_tsquery('english', 'Gokuseens'))
);
select pg_temp.expect(
  'matches @Gokuseens with @ prefix',
  exists (select 1 from public.post p, f where p.id = f.p_reddit and p.search @@ websearch_to_tsquery('english', '@Gokuseens'))
);
select pg_temp.expect(
  'matches MarcN-Apps hyphenated reddit handle without u/',
  exists (select 1 from public.post p, f where p.id = f.p_hyphen and p.search @@ websearch_to_tsquery('english', 'MarcN-Apps'))
);
select pg_temp.expect(
  'matches combined handle + keyword query',
  exists (select 1 from public.post p, f where p.id = f.p_x and p.search @@ websearch_to_tsquery('english', '@jeff_weinstein invoice'))
);

-- Updating source_author refreshes the generated search column.
update public.post p set source_author = '@renamed_author' from f where p.id = f.p_x_single;
select pg_temp.expect(
  'updated source_author is indexed immediately',
  exists (select 1 from public.post p, f where p.id = f.p_x_single and p.search @@ websearch_to_tsquery('english', 'renamed_author'))
  and not exists (select 1 from public.post p, f where p.id = f.p_x_single and p.search @@ websearch_to_tsquery('english', 'ChaseMc67'))
);

rollback;
