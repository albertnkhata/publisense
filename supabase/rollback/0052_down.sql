-- Rollback for 0052 (#170): back to the raw-length checks from 0016. Rows written
-- while 0052 was live all satisfy these, so this cannot fail.
alter table public.post drop constraint if exists post_title_check;
alter table public.post add constraint post_title_check check (char_length(title) between 3 and 140);

alter table public.reply drop constraint if exists reply_body_check;
alter table public.reply add constraint reply_body_check check (char_length(body) between 1 and 5000);
