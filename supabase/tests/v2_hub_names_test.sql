-- Publisense v2 name-history tests, run by CI after the migrations apply.
-- A hub has one current name and any number of former ones, and a slug belongs to the
-- company that used it for good. These checks exercise the triggers, the resolver and the
-- rename RPC as the real API roles. Everything runs in one transaction that is rolled
-- back, so the job can run it against any database.
--
-- A failed expectation raises and psql exits non-zero (ON_ERROR_STOP).

\set ON_ERROR_STOP 1
begin;

-- ------------------------------------------------------------ harness

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
  end if;
end $$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

create function pg_temp.expect_error(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok   % (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : statement succeeded but should have been refused', label;
end $$;

-- ------------------------------------------------------------ fixtures (as owner)

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'renamer@spacex.test', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'staff@publisense.app', '{}');

insert into public.platform_admin (user_id) values ('00000000-0000-4000-8000-0000000000a2');

-- A company under a name it already changed twice, and a second company to collide with.
insert into public.hub (slug, name, description) values
  ('spacexsi', 'SpaceXSI', 'SpaceX Super Intelligence'),
  ('other-co', 'Other Co', 'An unrelated company');
insert into public.hub (slug, name, description, status) values
  ('pending-co', 'Pending Co', 'Not live yet', 'pending');

create temp table ids as
select (select id from public.hub where slug = 'spacexsi')  as sxi,
       (select id from public.hub where slug = 'other-co')  as other,
       (select id from public.hub where slug = 'pending-co') as pending,
       (select id from public.hub where slug = 'figma')     as seeded,
       '00000000-0000-4000-8000-0000000000a1'::uuid as renamer,
       '00000000-0000-4000-8000-0000000000a2'::uuid as staff;
grant select on ids to anon, authenticated;

-- The history we already know about, recorded the way the migration records it.
insert into public.hub_name (hub_id, name, slug, kind, source, valid_from, valid_to)
select sxi, v.name, v.slug, v.kind, v.source, v.valid_from::date, v.valid_to::date
  from ids, (values
    ('xAI',      'xai',      'former', 'renamed SpaceXAI in July 2026',   '2023-03-09', '2026-07-06'),
    ('SpaceXAI', 'spacexai', 'former', 'renamed SpaceXSI in October 2026', '2026-07-06', '2026-10-04')
  ) as v(name, slug, kind, source, valid_from, valid_to);

-- ------------------------------------------------------------ one current name per hub

select pg_temp.expect('every hub has exactly one current name',
  (select count(*) from public.hub h
    where (select count(*) from public.hub_name n where n.hub_id = h.id and n.is_current) <> 1) = 0);

select pg_temp.expect('hub.name and hub.slug mirror the current name row',
  (select count(*) from public.hub h
     join public.hub_name n on n.hub_id = h.id and n.is_current
    where h.name <> n.name or h.slug <> n.slug) = 0);

-- ------------------------------------------------------------ a direct rename keeps history

-- This is the decide_board p_hub_name path: a plain update of hub.name / hub.slug.
select pg_temp.as_owner();
update public.hub set name = 'SpaceX Super Intelligence', slug = 'sxi'
 where id = (select sxi from ids);

select pg_temp.expect('a direct rename retires the name it replaced',
  (select is_current = false and valid_to = current_date
     from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'spacexsi'));
select pg_temp.expect('a direct rename makes the new name current',
  (select is_current from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'sxi'));
select pg_temp.expect('the old name is still on record, and still resolves',
  (select count(*) from public.hub_name
    where hub_id = (select sxi from ids) and slug in ('xai', 'spacexai', 'spacexsi')) = 3);

-- ------------------------------------------------------------ resolving former slugs

select pg_temp.expect('a former slug resolves to the same company',
  (select hub_id from public.resolve_hub_slug('xai')) = (select sxi from ids));
select pg_temp.expect('a former slug is reported as not current',
  (select is_current from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'xai') = false);
select pg_temp.expect('the current slug resolves and is current',
  (select is_current and name = 'SpaceX Super Intelligence'
     from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'sxi'));
select pg_temp.expect('a slug nobody used resolves to nothing',
  (select count(*) from public.resolve_hub_slug('never-used')) = 0);

-- ------------------------------------------------------------ a former slug is never reused

select pg_temp.expect_error('another company cannot take a former slug',
  $$update public.hub set slug = 'xai' where id = (select other from ids)$$);
select pg_temp.expect_error('a new company cannot be created on a former slug at all',
  $$insert into public.hub (slug, name, description) values ('spacexai', 'Copycat', 'nope')$$);

select pg_temp.expect('deriving a slug avoids former slugs',
  public.v2_hub_slug('xAI') <> 'xai');
select pg_temp.expect('...but a hub may reuse a name it used to have',
  public.v2_hub_slug('xAI', (select sxi from ids)) = 'xai');

-- ------------------------------------------------------------ rename_hub

select pg_temp.as_user((select renamer from ids));
select pg_temp.expect('a normal user cannot rename a company',
  (public.rename_hub((select sxi from ids), 'Musk Co') ->> 'error') = 'not_permitted');

select pg_temp.as_user((select staff from ids));
select pg_temp.expect('a platform admin can rename a company',
  (public.rename_hub((select sxi from ids), 'SpaceXSI', 'spacexsi',
                     'trade', 'reverted by admin') ->> 'ok')::boolean);
select pg_temp.expect('the rename records where the claim came from',
  (select source from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'spacexsi' and is_current) = 'reverted by admin');
select pg_temp.expect('the rename retires the name it replaced',
  (select is_current = false from public.hub_name
    where hub_id = (select sxi from ids) and slug = 'sxi'));
select pg_temp.expect('rename_hub reports a no-op as unchanged',
  (public.rename_hub((select sxi from ids), 'SpaceXSI') ->> 'changed')::boolean = false);
select pg_temp.expect('rename_hub refuses to take a slug another company used',
  (public.rename_hub((select other from ids), 'Copycat', 'xai') ->> 'error') = 'slug_taken');

-- ------------------------------------------------------------ visibility

select pg_temp.as_owner();
create temp table before_count as select count(*) as n from public.hub_name;

select pg_temp.as_user(null);
select pg_temp.expect('a visitor reads the names of a live company',
  (select count(*) from public.hub_name where hub_id = (select sxi from ids)) > 0);
select pg_temp.expect('a visitor cannot read a pending company''s names',
  (select count(*) from public.hub_name where hub_id = (select pending from ids)) = 0);
select pg_temp.expect_error('a visitor cannot write a name',
  $$insert into public.hub_name (hub_id, name, slug) values ((select sxi from ids), 'Injected', 'injected')$$);
select pg_temp.expect('former names are searchable by name',
  (select count(distinct hub_id) from public.hub_name where lower(name) = 'xai') = 1);

rollback;
