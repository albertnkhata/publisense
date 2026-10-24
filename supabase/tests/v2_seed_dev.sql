-- LOCAL AND CI ONLY. Never apply to production.
--
-- Sample content for developing v2 against a local database: demo users (with
-- @publisense.invalid emails, which can never receive mail or sign in) and the
-- mockup's sample posts on Cursor, Supabase, Linear and Figma. Seeded posts (no author)
-- point at example.com-style placeholder sources. Vote counts are set directly as the
-- mockup's numbers; there are no vote rows behind them.
--
-- Production content is decided at cutover (docs/deferred.md D-011).

\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email, raw_user_meta_data)
select gen_random_uuid(), u || '@publisense.invalid', jsonb_build_object('user_name', u, 'full_name', initcap(u))
  from unnest(array['aisha', 'chen', 'devon', 'jmwamba', 'kofi', 'lena', 'priya', 'ravi', 'soren', 'tomasz']) as u
 where not exists (select 1 from auth.users where email = u || '@publisense.invalid');

create temp table dev_post (board text, type public.v2_post_type, status public.v2_post_status, title text, body text,
  votes int, author text, age_min int, source text) on commit drop;
insert into dev_post values
  ('cursor', 'bug', 'in_progress', 'Composer window silently swallows multi-file git conflicts on fast apply', 'When applying edits across more than three files during a rebase, two buffers discard changes on save.', 92, 'jmwamba', 240, null),
  ('cursor', 'feature', 'open', 'Persistent terminal execution session across composer generation passes', 'Reusing one persistent shell instead of a new subshell per tool call would speed up compile cycles.', 76, 'soren', 1440, null),
  ('cursor', 'feature', 'shipped', 'Tab autocomplete multi-line ghost preview in secondary split windows', 'Ghost suggestions now render across multi-split layouts, not just the primary pane.', 114, 'chen', 4320, null),
  ('cursor', 'bug', 'in_progress', 'Rate limit errors don’t say when you can retry', 'The error just says “too many requests”. A retry-after time would save a lot of guessing and hammering.', 141, 'kofi', 600, null),
  ('cursor', 'feature', 'planned', 'Sync settings across machines', 'Setting everything up again on a second laptop takes an hour. Export or account sync would fix it.', 118, 'lena', 2900, null),
  ('cursor', 'bug', 'under_review', 'Secondary text contrast is too low in dark mode', 'Muted labels fall below WCAG AA on the dark theme, especially on smaller screens.', 87, null, 4300, 'https://github.com/example/issues/1'),
  ('cursor', 'feature', 'shipped', 'Usage breakdown by project on the billing page', 'Being able to see which project drove the bill would make budgeting much easier.', 203, 'priya', 12000, null),
  ('cursor', 'bug', 'open', 'Search ignores matches inside archived items', 'Archived items never show up in search, even when you explicitly search for their exact title.', 46, 'tomasz', 1400, null),
  ('cursor', 'feature', 'open', 'Weekly digest of what changed in my workspace', 'A short Monday email with new items, changes and mentions would replace three different notifications.', 39, 'aisha', 800, null),
  ('cursor', 'bug', 'shipped', 'Offline edits lost after reconnecting', 'Changes made while offline were silently dropped when the connection came back.', 176, null, 20000, 'https://www.reddit.com/r/example/comments/1'),
  ('cursor', 'feature', 'in_progress', 'Keyboard shortcut to jump between recent workspaces', 'Switching back and forth between two workspaces takes four clicks every time.', 64, 'ravi', 3600, null),
  ('cursor', 'bug', 'planned', 'Notifications arrive twice on mobile', 'Every mention shows up as two push notifications a few seconds apart on Android.', 52, null, 5200, 'https://x.com/example/status/1'),
  ('cursor', 'feature', 'open', 'Bulk edit for labels', 'Re-labelling dozens of items one by one is tedious. Multi-select with a label action would help.', 33, 'devon', 300, null),
  ('supabase', 'bug', 'in_progress', 'Rate limit errors don’t say when you can retry', 'The error just says “too many requests”. A retry-after time would save a lot of guessing and hammering.', 141, 'kofi', 600, null),
  ('supabase', 'feature', 'planned', 'Sync settings across machines', 'Setting everything up again on a second laptop takes an hour. Export or account sync would fix it.', 118, 'lena', 2900, null),
  ('supabase', 'bug', 'under_review', 'Secondary text contrast is too low in dark mode', 'Muted labels fall below WCAG AA on the dark theme, especially on smaller screens.', 87, null, 4300, 'https://github.com/example/issues/1'),
  ('supabase', 'feature', 'shipped', 'Usage breakdown by project on the billing page', 'Being able to see which project drove the bill would make budgeting much easier.', 203, 'priya', 12000, null),
  ('supabase', 'bug', 'open', 'Search ignores matches inside archived items', 'Archived items never show up in search, even when you explicitly search for their exact title.', 46, 'tomasz', 1400, null),
  ('supabase', 'feature', 'open', 'Weekly digest of what changed in my workspace', 'A short Monday email with new items, changes and mentions would replace three different notifications.', 39, 'aisha', 800, null),
  ('supabase', 'bug', 'shipped', 'Offline edits lost after reconnecting', 'Changes made while offline were silently dropped when the connection came back.', 176, null, 20000, 'https://www.reddit.com/r/example/comments/1'),
  ('supabase', 'feature', 'in_progress', 'Keyboard shortcut to jump between recent workspaces', 'Switching back and forth between two workspaces takes four clicks every time.', 64, 'ravi', 3600, null),
  ('supabase', 'bug', 'planned', 'Notifications arrive twice on mobile', 'Every mention shows up as two push notifications a few seconds apart on Android.', 52, null, 5200, 'https://x.com/example/status/1'),
  ('supabase', 'feature', 'open', 'Bulk edit for labels', 'Re-labelling dozens of items one by one is tedious. Multi-select with a label action would help.', 33, 'devon', 300, null),
  ('linear', 'bug', 'in_progress', 'Rate limit errors don’t say when you can retry', 'The error just says “too many requests”. A retry-after time would save a lot of guessing and hammering.', 141, 'kofi', 600, null),
  ('linear', 'feature', 'planned', 'Sync settings across machines', 'Setting everything up again on a second laptop takes an hour. Export or account sync would fix it.', 118, 'lena', 2900, null),
  ('linear', 'bug', 'under_review', 'Secondary text contrast is too low in dark mode', 'Muted labels fall below WCAG AA on the dark theme, especially on smaller screens.', 87, null, 4300, 'https://github.com/example/issues/1'),
  ('linear', 'feature', 'shipped', 'Usage breakdown by project on the billing page', 'Being able to see which project drove the bill would make budgeting much easier.', 203, 'priya', 12000, null),
  ('linear', 'bug', 'open', 'Search ignores matches inside archived items', 'Archived items never show up in search, even when you explicitly search for their exact title.', 46, 'tomasz', 1400, null),
  ('linear', 'feature', 'open', 'Weekly digest of what changed in my workspace', 'A short Monday email with new items, changes and mentions would replace three different notifications.', 39, 'aisha', 800, null),
  ('linear', 'bug', 'shipped', 'Offline edits lost after reconnecting', 'Changes made while offline were silently dropped when the connection came back.', 176, null, 20000, 'https://www.reddit.com/r/example/comments/1'),
  ('linear', 'feature', 'in_progress', 'Keyboard shortcut to jump between recent workspaces', 'Switching back and forth between two workspaces takes four clicks every time.', 64, 'ravi', 3600, null),
  ('linear', 'bug', 'planned', 'Notifications arrive twice on mobile', 'Every mention shows up as two push notifications a few seconds apart on Android.', 52, null, 5200, 'https://x.com/example/status/1'),
  ('linear', 'feature', 'open', 'Bulk edit for labels', 'Re-labelling dozens of items one by one is tedious. Multi-select with a label action would help.', 33, 'devon', 300, null),
  ('figma', 'bug', 'in_progress', 'Rate limit errors don’t say when you can retry', 'The error just says “too many requests”. A retry-after time would save a lot of guessing and hammering.', 141, 'kofi', 600, null),
  ('figma', 'feature', 'planned', 'Sync settings across machines', 'Setting everything up again on a second laptop takes an hour. Export or account sync would fix it.', 118, 'lena', 2900, null),
  ('figma', 'bug', 'under_review', 'Secondary text contrast is too low in dark mode', 'Muted labels fall below WCAG AA on the dark theme, especially on smaller screens.', 87, null, 4300, 'https://github.com/example/issues/1'),
  ('figma', 'feature', 'shipped', 'Usage breakdown by project on the billing page', 'Being able to see which project drove the bill would make budgeting much easier.', 203, 'priya', 12000, null),
  ('figma', 'bug', 'open', 'Search ignores matches inside archived items', 'Archived items never show up in search, even when you explicitly search for their exact title.', 46, 'tomasz', 1400, null),
  ('figma', 'feature', 'open', 'Weekly digest of what changed in my workspace', 'A short Monday email with new items, changes and mentions would replace three different notifications.', 39, 'aisha', 800, null),
  ('figma', 'bug', 'shipped', 'Offline edits lost after reconnecting', 'Changes made while offline were silently dropped when the connection came back.', 176, null, 20000, 'https://www.reddit.com/r/example/comments/1'),
  ('figma', 'feature', 'in_progress', 'Keyboard shortcut to jump between recent workspaces', 'Switching back and forth between two workspaces takes four clicks every time.', 64, 'ravi', 3600, null),
  ('figma', 'bug', 'planned', 'Notifications arrive twice on mobile', 'Every mention shows up as two push notifications a few seconds apart on Android.', 52, null, 5200, 'https://x.com/example/status/1'),
  ('figma', 'feature', 'open', 'Bulk edit for labels', 'Re-labelling dozens of items one by one is tedious. Multi-select with a label action would help.', 33, 'devon', 300, null);

-- Insert as the table owner so the client-side insert guard leaves author, status,
-- source and timestamps as given.
insert into public.post (board_id, author_id, source_url, type, status, title, body, created_at, vote_count)
select b.id, p.id, d.source, d.type, d.status, d.title, d.body, now() - make_interval(mins => d.age_min), d.votes
  from dev_post d
  join public.board b on b.slug = d.board
  left join public.profile p on p.handle = d.author
 where not exists (select 1 from public.post x where x.board_id = b.id and x.title = d.title);

insert into public.status_event (post_id, "from", "to", actor_id, at)
select id, 'open', status, null, created_at + interval '1 hour'
  from public.post where status <> 'open'
   and not exists (select 1 from public.status_event e where e.post_id = post.id);
commit;
\echo 'v2 dev seed applied'
