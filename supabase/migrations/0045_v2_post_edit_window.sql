-- 0045: authors edit their post only within 1 hour of posting, and never once it is
-- Shipped, Closed or Merged (QA 2026-10-27, PR #172). Approved by Albert on 2026-10-27.
--
-- Before: an author could change the title and details at any time, even after the
-- team had answered and shipped it, so the record could drift from what was answered.
--
-- Now a BEFORE UPDATE trigger refuses an author's change to title, body, type or
-- platform (the columns 0017/0033 let them write) when:
--   * the post is shipped, closed or merged (hint 'edit_locked_status'), or
--   * it was created more than public.v2_post_edit_window() ago (hint 'edit_window_closed').
-- Both raise 42501, so PostgREST answers 403 and nothing is written.
--
-- THE WINDOW LIVES IN ONE PLACE: public.v2_post_edit_window(). To change it, add a
-- migration that re-creates that function with the new interval, and change
-- POST_EDIT_WINDOW_MINUTES in web/src/api/posts.ts (a unit test fails while the two
-- disagree).
--
-- Unchanged:
--   * Team and staff abilities. Status, hide, merge and seeded-post edits run through
--     SECURITY DEFINER RPCs (current_user is the owner, not an API role), so the
--     trigger does not apply to them.
--   * Deleting your own post.
--   * Reply editing (left as is; see the PR).
--
-- Rollback: drop trigger v2_post_author_edit_guard on public.post;
--           drop function public.v2_post_author_edit_guard();
--           drop function public.v2_post_edit_window();

create or replace function public.v2_post_edit_window()
returns interval language sql immutable as $$
  select interval '1 hour';
$$;
comment on function public.v2_post_edit_window() is
  'How long after posting an author may edit their post (0045). Mirrored by POST_EDIT_WINDOW_MINUTES in web/src/api/posts.ts.';
grant execute on function public.v2_post_edit_window() to anon, authenticated;

-- SECURITY INVOKER on purpose: current_user must be the caller's role, as in
-- v2_post_before_insert (0017).
create or replace function public.v2_post_author_edit_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.type is distinct from old.type
       or new.platform is distinct from old.platform) then
    if old.status in ('shipped', 'closed', 'merged') then
      raise exception 'this post can no longer be edited (it is %)', old.status
        using errcode = '42501', hint = 'edit_locked_status';
    end if;
    if old.created_at < now() - public.v2_post_edit_window() then
      raise exception 'posts can be edited for % minutes after posting', extract(epoch from public.v2_post_edit_window())::int / 60
        using errcode = '42501', hint = 'edit_window_closed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists v2_post_author_edit_guard on public.post;
create trigger v2_post_author_edit_guard before update on public.post
  for each row execute function public.v2_post_author_edit_guard();
