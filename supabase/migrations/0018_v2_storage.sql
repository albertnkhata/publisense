-- Publisense v2: Storage (FOUNDATION section 6, Storage).
--
-- Two public-read buckets. Rows store the object path inside the bucket, never a URL:
--   avatars      {user_id}/{uuid}.{ext}   only that user writes under their prefix
--   board-logos  {board_id}/{uuid}.{ext}  only owners/admins of the board (or its hub)
--
-- Images only, 1 MB. SVG is deliberately NOT allowed yet: the spec says "svg
-- sanitised", and a client-side sanitiser is not a guard, since anyone can upload
-- straight to the Storage API. Until a server-side sanitiser exists (an Edge Function),
-- png/jpeg/webp only. Recorded in docs/v2/FOUNDATION.md.
--
-- PORTABILITY. The CI harness stubs the parts of Supabase's storage schema these
-- statements touch. On a Postgres with no storage schema at all, this file stops with
-- a notice instead of failing, the same pattern as 0015.

-- Board id from an object path, or null when the first segment is not a uuid, so a
-- malformed path fails the policy rather than raising a cast error.
create or replace function public.v2_path_board(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end $$;

do $storage$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice '0018: no storage schema here; buckets and policies skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
         ('board-logos', 'board-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Path shape: exactly two segments, a uuid file name and an allowed extension.
  execute $p$
    create policy "v2 avatars read" on storage.objects for select
      using (bucket_id = 'avatars')
  $p$;
  execute $p$
    create policy "v2 avatars insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars'
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
                  and split_part(name, '/', 1) = auth.uid()::text)
  $p$;
  execute $p$
    create policy "v2 avatars update" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
      with check (bucket_id = 'avatars'
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
                  and split_part(name, '/', 1) = auth.uid()::text)
  $p$;
  execute $p$
    create policy "v2 avatars delete" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  $p$;

  execute $p$
    create policy "v2 board-logos read" on storage.objects for select
      using (bucket_id = 'board-logos')
  $p$;
  execute $p$
    create policy "v2 board-logos insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'board-logos'
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
                  and public.is_board_admin(public.v2_path_board(name)))
  $p$;
  execute $p$
    create policy "v2 board-logos update" on storage.objects for update to authenticated
      using (bucket_id = 'board-logos' and public.is_board_admin(public.v2_path_board(name)))
      with check (bucket_id = 'board-logos'
                  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
                  and public.is_board_admin(public.v2_path_board(name)))
  $p$;
  execute $p$
    create policy "v2 board-logos delete" on storage.objects for delete to authenticated
      using (bucket_id = 'board-logos' and public.is_board_admin(public.v2_path_board(name)))
  $p$;
end
$storage$;

-- "Old files are deleted on replace" is done by the web api layer through the Storage
-- API (remove the previous path after the row points at the new one). The owner's
-- delete policy above allows it. It is not a trigger here because Supabase refuses
-- direct deletes from storage.objects, which would leave the bytes behind anyway.
