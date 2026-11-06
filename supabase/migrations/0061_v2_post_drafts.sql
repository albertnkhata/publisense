-- 0061: saved post drafts. Each person keeps up to 20 drafts, synced across devices;
-- the composer lists them under Drafts and posting or deleting one removes it.
--
--   post_draft   owner-only (select, insert, update, delete where author_id = auth.uid()).
--                author_id is always the caller; updated_at is stamped on every change.
--                images reuse 0060's rules: at most 4 paths, each under the author's own prefix.
--
-- A draft holds work in progress, so it is looser than a post: title may be empty or
-- over the post limit, board and type may be unset. Drafts go when the account goes.

create table if not exists public.post_draft (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profile (id) on delete cascade,
  board_id    uuid references public.board (id) on delete set null,
  type        public.v2_post_type,
  platform    text check (platform is null or platform in ('ios', 'android', 'web', 'desktop', 'macos', 'windows')),
  title       text not null default '' check (char_length(title) <= 1000),
  body        text not null default '' check (char_length(body) <= 10000),
  images      text[] not null default '{}' check (private.post_images_valid(images)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists post_draft_author_idx on public.post_draft (author_id, updated_at desc);
comment on table public.post_draft is 'A person''s saved post drafts, owner-only, at most 20 each (0061).';

alter table public.post_draft enable row level security;

drop policy if exists "post_draft owner read"   on public.post_draft;
drop policy if exists "post_draft owner insert" on public.post_draft;
drop policy if exists "post_draft owner update" on public.post_draft;
drop policy if exists "post_draft owner delete" on public.post_draft;
create policy "post_draft owner read"   on public.post_draft for select to authenticated using (author_id = auth.uid());
create policy "post_draft owner insert" on public.post_draft for insert to authenticated with check (author_id = auth.uid());
create policy "post_draft owner update" on public.post_draft for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "post_draft owner delete" on public.post_draft for delete to authenticated using (author_id = auth.uid());

revoke all on public.post_draft from anon, authenticated;
grant select, delete on public.post_draft to authenticated;
grant insert (board_id, type, platform, title, body, images) on public.post_draft to authenticated;
grant update (board_id, type, platform, title, body, images) on public.post_draft to authenticated;

create or replace function public.v2_post_draft_before_write()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if auth.uid() is null then raise exception 'sign in to save drafts' using errcode = '42501'; end if;
    if tg_op = 'INSERT' then
      new.author_id  := auth.uid();
      new.created_at := now();
      if (select count(*) from public.post_draft d where d.author_id = new.author_id) >= 20 then
        raise exception 'you can keep up to 20 drafts' using errcode = '42501', hint = 'draft_limit';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if not private.post_images_owned(new.images, new.author_id) then
    raise exception 'images must be your own uploads' using errcode = '42501', hint = 'images_not_owned';
  end if;
  return new;
end $function$;

drop trigger if exists post_draft_before_write on public.post_draft;
create trigger post_draft_before_write before insert or update on public.post_draft
  for each row execute function public.v2_post_draft_before_write();

notify pgrst, 'reload schema';
