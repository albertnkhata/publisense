-- 0044: "Update status" sends ONE notification and keeps its note on the timeline
-- (QA 2026-10-27, PR #172). Approved by Albert on 2026-10-27.
--
-- Before: the Update status dialog called set_post_status (no note) and then posted
-- the note as a pinned official reply. Followers got two notifications (status_change
-- and reply), the post author two emails, and status_event.note stayed empty.
--
-- Now the dialog passes the note to set_post_status, which already records the status
-- and the note in one status_event inside one transaction. This migration makes that
-- the single combined event:
--   * the status_change notification carries the note (data.note), so the in-app
--     notification can quote it; the email already quotes the status_event note
--     (0036-0039), so one action = one notification = one email (or one held email,
--     batched by 0038's flush exactly as before);
--   * a note with no status change is refused instead of being dropped silently. A
--     team reply that isn't a status change goes through the reply box ("Reply as the
--     team"), which is unchanged.
-- Followers are notified as before (the author follows their post on creation, voters
-- follow on voting); who gets notified is unchanged.
--
-- Rollback: re-run the set_post_status definition from 0017_v2_rls.sql (create or
-- replace keeps its grants).

create or replace function public.set_post_status(p_post uuid, p_to public.v2_post_status, p_note text default null)
returns public.post language plpgsql security definer set search_path = public as $$
declare
  p      post;
  f      record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into p from post where id = p_post for update;
  if not found then raise exception 'post not found' using errcode = 'no_data_found'; end if;
  if not is_board_team(p.board_id) then raise exception 'only the team can change status' using errcode = '42501'; end if;
  if p_to = 'merged' then raise exception 'use merge_post to merge' using errcode = 'check_violation'; end if;
  if p.status = 'merged' then raise exception 'a merged post is terminal; use unmerge_post' using errcode = 'check_violation'; end if;
  if p.status = p_to then
    if v_note is not null then
      raise exception 'pick a new status to add a timeline note; reply as the team to post a message'
        using errcode = 'check_violation', hint = 'note_without_change';
    end if;
    return p;
  end if;

  insert into status_event (post_id, "from", "to", note, actor_id)
  values (p.id, p.status, p_to, v_note, auth.uid());
  update post set status = p_to where id = p.id returning * into p;

  -- Everyone following the post hears about it once; voters follow automatically.
  for f in select user_id from follow where target = 'post' and target_id = p.id loop
    perform v2_notify(f.user_id, 'status_change', auth.uid(), 'post', p.id, p.id,
                      jsonb_strip_nulls(jsonb_build_object('to', p_to, 'note', v_note)));
  end loop;
  return p;
end $$;

-- Unchanged from 0040: signed-in callers only (the function checks the team itself).
revoke execute on function public.set_post_status(uuid, public.v2_post_status, text) from public, anon;
grant execute on function public.set_post_status(uuid, public.v2_post_status, text) to authenticated;
