-- Rollback for 0071 (maintainer new-post notifications). Restores v2_post_after,
-- v2_email_recipient, v2_email_send, and the v2_notification_email trigger to their
-- pre-0071 definitions. The 'new_post' value stays in v2_notification_kind: Postgres
-- cannot drop an enum value, and an unused one is harmless.
begin;

create or replace function public.v2_post_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update board set post_count = post_count + 1 where id = new.board_id;
    if new.author_id is not null then
      insert into follow (user_id, target, target_id) values (new.author_id, 'post', new.id)
        on conflict do nothing;
    end if;
    return new;
  else
    update board set post_count = greatest(post_count - 1, 0) where id = old.board_id;
    delete from follow where target = 'post' and target_id = old.id;
    delete from notification where target_type = 'post' and target_id = old.id;
    return old;
  end if;
end $$;

create or replace function public.v2_email_recipient(n public.notification)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_to text;
begin
  if not ((n.kind in ('reply', 'mention', 'status_change') and n.post_id is not null)
          or (n.kind = 'product' and n.target_type = 'board' and n.target_id is not null)) then
    return null;
  end if;
  if exists (select 1 from notification_pref
              where user_id = n.recipient and kind = n.kind and channel = 'email' and not enabled) then
    return null;
  end if;
  select u.email into v_to from auth.users u
   where u.id = n.recipient and u.email_confirmed_at is not null and u.deleted_at is null;
  return v_to;
end $$;

drop trigger if exists v2_notification_email on public.notification;
create trigger v2_notification_email
  after insert on public.notification
  for each row when (new.kind in ('reply', 'status_change', 'product'))
  execute function public.v2_notification_email_after();

revoke execute on function public.v2_post_after() from public, anon, authenticated;
revoke execute on function public.v2_email_recipient(public.notification) from public, anon, authenticated;

delete from public.notification_pref where kind::text = 'new_post';
commit;
notify pgrst, 'reload schema';
