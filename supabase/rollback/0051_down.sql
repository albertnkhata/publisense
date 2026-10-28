-- Rollback for 0051 (reply edit rules, #181). Back to pre-0051 behaviour: the author
-- may edit their reply's body at any time (RLS and the body column grant are untouched
-- by 0051, so nothing else needs restoring).
drop trigger if exists v2_reply_author_edit_guard on public.reply;
drop function if exists public.v2_reply_author_edit_guard();
