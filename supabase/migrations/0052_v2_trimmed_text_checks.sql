-- 0052: whitespace-only post titles and reply bodies are refused by the database (#170).
-- Approved by Albert on 2026-10-28 (07:14 CAT).
--
-- Before: the table checks from 0016 counted raw characters, so a title of three spaces
-- or a reply of one space passed when written straight to the API (the web UI trims and
-- blocks them, web/src/api/posts.ts validatePost/validateReply). QA found both stored on
-- production-like data (2026-10-27, docs/qa/2026-10-27-e2e-feedback-loop.md).
--
-- Now the same constraints check the TRIMMED length as well:
--   post.title  : trimmed 3-140 characters (raw length still at most 140)
--   reply.body  : trimmed 1-5000 characters (raw length still at most 5000)
-- "Trimmed" strips the characters JavaScript's String.prototype.trim() strips (what the
-- client uses), so the database and the UI agree on what counts as empty: ASCII
-- whitespace, NBSP, the Unicode space separators, line/paragraph separators and the BOM.
-- A violation raises 23514 (check_violation); PostgREST answers 400 and nothing is
-- written. Constraints, not triggers, so every writer (API roles, definer RPCs, imports,
-- the table owner) is held to the same rule. Constraint names are unchanged.
--
-- Production had no violating rows when this was written (checked 2026-10-28 against
-- the same trimmed rule): nothing was cleaned up. ADD CONSTRAINT validates existing rows,
-- so the migration fails, changing nothing, if one appears before it is applied.
--
-- No RLS, grant or auth change.
--
-- Rollback: supabase/rollback/0052_down.sql (restores the 0016 raw-length checks).

alter table public.post drop constraint if exists post_title_check;
alter table public.post add constraint post_title_check check (
  char_length(title) <= 140
  and char_length(btrim(title, E' \t\n\r\u000b\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')) between 3 and 140
);

alter table public.reply drop constraint if exists reply_body_check;
alter table public.reply add constraint reply_body_check check (
  char_length(body) <= 5000
  and char_length(btrim(body, E' \t\n\r\u000b\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')) between 1 and 5000
);
