-- Rollback for 0075_v2_admin_delete_post.sql.

drop function if exists public.admin_delete_post(uuid);

create or replace function public.delete_seeded_post(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return public.v2_err('sign_in'); end if;
  if not private.is_platform_admin(uid) then return public.v2_err('not_allowed'); end if;
  delete from post where id = p_post and author_id is null and source_url is not null;
  if not found then return public.v2_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.delete_seeded_post(uuid) from public, anon;
grant execute on function public.delete_seeded_post(uuid) to authenticated;
