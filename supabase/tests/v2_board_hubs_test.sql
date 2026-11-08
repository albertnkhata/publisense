-- Required board-to-hub relationship (0063). Runs on the seeded CI database and rolls back.
-- A legacy/null board write gets a UI-hidden product singleton, while existing hub
-- associations remain intact and a referenced hub cannot be deleted underneath a product.

\set ON_ERROR_STOP 1
begin;

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

select pg_temp.expect('migration: every seeded product has a hub',
  not exists (select 1 from public.board where hub_id is null));
select pg_temp.expect('migration: board.hub_id is enforced NOT NULL',
  (select attnotnull from pg_attribute where attrelid = 'public.board'::regclass and attname = 'hub_id'));
select pg_temp.expect('migration: deleting a referenced hub is restricted',
  (select confdeltype = 'r' from pg_constraint where conrelid = 'public.board'::regclass and conname = 'board_hub_id_fkey'));

-- A bare insert models legacy/admin SQL callers. The trigger must create a singleton before
-- the new NOT NULL constraint is checked; its name follows the product rather than guessing
-- a parent company from a possibly shared site.
insert into public.board (slug, name, site)
values ('hub-invariant-regression', 'Hub Invariant Regression', null);

select pg_temp.expect('insert: a product without an explicit hub receives a singleton',
  (select b.hub_id = h.id and h.name = b.name and h.status = 'live'
          and (select count(*) from public.board sibling where sibling.hub_id = h.id) = 1
     from public.board b join public.hub h on h.id = b.hub_id
    where b.slug = 'hub-invariant-regression'));

-- A caller that explicitly clears the relationship also gets a fresh singleton, rather than
-- leaving a dangling product or reusing the previous company's hub.
update public.board set hub_id = null where slug = 'hub-invariant-regression';
select pg_temp.expect('update: clearing a hub creates a replacement singleton',
  (select b.hub_id = h.id and h.name = b.name
          and (select count(*) from public.board sibling where sibling.hub_id = h.id) = 1
     from public.board b join public.hub h on h.id = b.hub_id
    where b.slug = 'hub-invariant-regression'));
select pg_temp.expect_error('delete: a hub cannot detach its product',
  $$delete from public.hub where id = (select hub_id from public.board where slug = 'hub-invariant-regression')$$);

\echo 'v2 board-hub tests: all passed'
rollback;
