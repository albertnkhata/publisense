#!/usr/bin/env python3
"""Usage: python3 scripts/cutover/dump.py <out-dir>

Logical backup of the Publisense production database through the Supabase
Management API query endpoint, in read-only mode (runs as supabase_read_only_user
inside a read-only transaction, so it cannot write).

Writes into OUT:
  schema.sql   DDL for schemas public + ci_probe: enums, tables, defaults, constraints,
               indexes, functions, views, triggers (incl. the two on auth.users), RLS,
               policies (incl. storage.objects), grants
  data.sql     every row of every table in public + ci_probe, plus storage.buckets,
               storage.objects, auth.users, auth.identities, auth.mfa_factors
  data/*.json  the same rows as JSON, one file per table
  counts.json  exact production row counts at dump time
  meta.json    project, versions, extensions, vault secret names (never values)
"""
import json, os, sys, hashlib
from sbq import q

OUT = sys.argv[1]
os.makedirs(f'{OUT}/data', exist_ok=True)
SCH = ('public', 'ci_probe')
SP = 'set search_path = pg_catalog; '
def Q(sql): return q(SP + sql)
def ident(s): return '"' + s.replace('"', '""') + '"'
def lit(s): return "'" + s.replace("'", "''") + "'"
def dq(s):
    tag = '$bk$'
    while tag in s: tag = tag[:-1] + 'x$'
    return f'{tag}{s}{tag}'

schlist = ','.join(lit(s) for s in SCH)
ddl = ['-- Publisense production logical backup: schema',
       '-- Source: Supabase project wyjfgrgxmhumyzwcrywj (read-only via Management API)',
       "set check_function_bodies = off;", "set client_min_messages = warning;", '']

# extensions (expected on the target: Supabase has them; local harness stubs them)
exts = Q("select extname, extversion, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by 1")
ddl.append('-- extensions present in production (create on target if missing):')
for e in exts: ddl.append(f"--   {e['extname']} {e['extversion']} in schema {e['nspname']}")
ddl.append('')
ddl.append('create schema if not exists ci_probe;')

# enums
for t in Q(f"""select n.nspname s, t.typname n, json_agg(e.enumlabel::text order by e.enumsortorder) labels
  from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
  where n.nspname in ({schlist}) group by 1,2 order by 1,2"""):
    ddl.append(f"create type {ident(t['s'])}.{ident(t['n'])} as enum ({', '.join(lit(x) for x in t['labels'])});")
ddl.append('')

tables = Q(f"""select c.oid::int oid, n.nspname s, c.relname t, c.relrowsecurity rls, c.relforcerowsecurity frls, c.relacl::text[] acl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ({schlist}) order by 1,2""")
cols = Q(f"""select c.oid::int oid, a.attnum, a.attname, format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn,
  pg_get_expr(d.adbin,d.adrelid) def, a.attidentity ident, a.attgenerated gen, a.attacl::text[] acl
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where c.relkind in ('r','p','v') and n.nspname in ({schlist}) and a.attnum>0 and not a.attisdropped order by 1,2""")
bycol = {}
for c in cols: bycol.setdefault(c['oid'], []).append(c)

defaults_later = []
for t in tables:
    fq = f"{ident(t['s'])}.{ident(t['t'])}"
    lines = []
    for c in bycol[t['oid']]:
        l = f"  {ident(c['attname'])} {c['typ']}"
        if c['gen'] == 's':
            l += f" generated always as ({c['def']}) stored"
        elif c['ident']:
            l += ' generated ' + ('always' if c['ident'] == 'a' else 'by default') + ' as identity'
        elif c['def'] is not None:
            defaults_later.append(f"alter table {fq} alter column {ident(c['attname'])} set default {c['def']};")
        if c['nn']: l += ' not null'
        lines.append(l)
    ddl.append(f"create table {fq} (\n" + ',\n'.join(lines) + '\n);')
ddl.append('')

# functions (bodies unchecked: check_function_bodies = off)
funcs = Q(f"""select n.nspname s, p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_functiondef(p.oid) def,
  p.proacl::text[] acl, p.prokind from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  left join pg_depend dep on dep.objid=p.oid and dep.deptype='e'
  where n.nspname in ({schlist}) and dep.objid is null and p.prokind in ('f','p') order by 1,2,3""")
ddl.append('-- functions'); fdefs = []
for f in funcs: fdefs.append(f['def'].rstrip() + ';')

ddl.extend(defaults_later); ddl.append('')

cons = Q(f"""select n.nspname s, c.relname t, k.conname, k.contype, pg_get_constraintdef(k.oid) def
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ({schlist}) and k.contype in ('p','u','c','x','f') order by case k.contype when 'p' then 0 when 'u' then 1 when 'x' then 2 when 'c' then 3 else 4 end, 1,2,3""")
cons_nf = [k for k in cons if k['contype'] != 'f']; cons_f = [k for k in cons if k['contype'] == 'f']
def con_sql(k): return f"alter table {ident(k['s'])}.{ident(k['t'])} add constraint {ident(k['conname'])} {k['def']};"

idx = Q(f"""select pg_get_indexdef(i.indexrelid) def from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ({schlist}) and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid) order by 1""")

views = Q(f"""select n.nspname s, c.relname v, pg_get_viewdef(c.oid) def, c.reloptions opts, c.relacl::text[] acl, c.oid::int oid
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='v' and n.nspname in ({schlist}) order by 1,2""")

# Constraints that are not FKs may call functions (none do today); put functions first so check
# constraints and views can reference them, then the rest.
ddl.append('-- functions'); ddl.extend(fdefs); ddl.append('')
ddl.append('-- primary keys, unique, exclusion and check constraints'); ddl.extend(con_sql(k) for k in cons_nf); ddl.append('')
ddl.append('-- indexes'); ddl.extend(i['def'] + ';' for i in idx); ddl.append('')
ddl.append('-- foreign keys'); ddl.extend(con_sql(k) for k in cons_f); ddl.append('')
ddl.append('-- views')
for v in views:
    w = f" with ({', '.join(v['opts'])})" if v['opts'] else ''
    ddl.append(f"create view {ident(v['s'])}.{ident(v['v'])}{w} as\n{v['def'].rstrip().rstrip(';')};")
ddl.append('')

trg = Q(f"""select pg_get_triggerdef(t.oid) def, n.nspname s from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
  where not t.tgisinternal and (n.nspname in ({schlist}) or pn.nspname in ({schlist})) order by 2,1""")
ddl.append('-- triggers (includes the v1 and v2 signup triggers on auth.users)')
ddl.extend(t['def'] + ';' for t in trg); ddl.append('')

ddl.append('-- row level security')
for t in tables:
    fq = f"{ident(t['s'])}.{ident(t['t'])}"
    if t['rls']: ddl.append(f"alter table {fq} enable row level security;")
    if t['frls']: ddl.append(f"alter table {fq} force row level security;")
ddl.append('')

pols = Q(f"""select schemaname s, tablename t, policyname p, permissive, roles::text[] roles, cmd, qual, with_check from pg_policies
  where schemaname in ({schlist}) or (schemaname='storage' and tablename='objects') order by 1,2,3""")
ddl.append('-- policies (storage.objects policies: drop first so a restore onto a live Supabase replaces them)')
for p in pols:
    fq = f"{ident(p['s'])}.{ident(p['t'])}"
    if p['s'] == 'storage': ddl.append(f"drop policy if exists {ident(p['p'])} on {fq};")
    s = f"create policy {ident(p['p'])} on {fq} as {p['permissive'].lower()} for {p['cmd'].lower()} to {', '.join(r if r=='public' else ident(r) for r in p['roles'])}"
    if p['qual'] is not None: s += f" using ({p['qual']})"
    if p['with_check'] is not None: s += f" with check ({p['with_check']})"
    ddl.append(s + ';')
ddl.append('')

# grants. Revoke the default-privilege grants first so the result matches production exactly.
PRIV = {'r':'select','a':'insert','w':'update','d':'delete','D':'truncate','x':'references','t':'trigger','X':'execute','U':'usage','C':'create','m':'maintain'}
API = ['anon', 'authenticated', 'service_role']
def acl_grants(acl, target, colspec=''):
    out = []
    for item in acl or []:
        grantee, rest = item.split('=', 1); privs = rest.split('/')[0]
        g = 'public' if grantee == '' else ident(grantee.strip('"'))
        if grantee in ('postgres', 'supabase_admin'): continue  # owners; not portable
        names = []; i = 0
        while i < len(privs):
            ch = privs[i]
            if ch in PRIV:
                grantopt = i + 1 < len(privs) and privs[i+1] == '*'
                names.append(PRIV[ch])
                i += 2 if grantopt else 1
            else: i += 1
        if names: out.append(f"grant {', '.join(sorted(set(names)))}{colspec} on {target} to {g};")
    return out
ddl.append('-- grants (owner grants for postgres/supabase_admin omitted)')
for t in tables + [{'s': v['s'], 't': v['v'], 'acl': v['acl'], 'oid': v['oid']} for v in views]:
    fq = f"{ident(t['s'])}.{ident(t['t'])}"
    ddl.append(f"revoke all on table {fq} from public, anon, authenticated, service_role;")
    ddl.extend(acl_grants(t['acl'], f'table {fq}'))
    for c in bycol.get(t['oid'], []):
        if c['acl']:
            for x in acl_grants(c['acl'], f'table {fq}'):
                privs, rest = x[len('grant '):].split(' on table ', 1)
                col = ident(c['attname'])
                ddl.append('grant ' + ', '.join(f'{p} ({col})' for p in privs.split(', ')) + ' on table ' + rest)
for f in funcs:
    fq = f"function {ident(f['s'])}.{ident(f['proname'])}({f['args']})" if f['prokind'] == 'f' else f"procedure {ident(f['s'])}.{ident(f['proname'])}({f['args']})"
    ddl.append(f"revoke all on {fq} from public, anon, authenticated, service_role;")
    if f['acl'] is None:  # null acl = default: execute to public
        ddl.append(f"grant execute on {fq} to public;")
    else: ddl.extend(acl_grants(f['acl'], fq))
ddl.append('grant usage on schema public to anon, authenticated, service_role;')
ddl.append('')
open(f'{OUT}/schema.sql', 'w').write('\n'.join(ddl) + '\n')

# ---------------- data ----------------
EXTRA = [('storage', 'buckets'), ('storage', 'objects'), ('auth', 'users'), ('auth', 'identities'), ('auth', 'mfa_factors')]
data_tables = [(t['s'], t['t']) for t in tables] + EXTRA
counts = {}
dat = ['-- Publisense production logical backup: data',
       '-- Load with triggers and FK checks off: session_replication_role = replica (superuser).',
       'set session_replication_role = replica;', 'set client_min_messages = warning;',
       # Portable loader: inserts the JSON rows into whatever columns the target table has
       # (skipping generated columns), so auth/storage rows load into Supabase or a stub.
       """create or replace function pg_temp._restore_json(t regclass, rows jsonb) returns int language plpgsql as $f$
declare cols text; n int;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a where a.attrelid = t and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and exists (select 1 from jsonb_array_elements(rows) r where r ? a.attname);
  if cols is null then return 0; end if;
  execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_recordset(null::%s, $1)', t, cols, cols, t) using rows;
  get diagnostics n = row_count; return n;
end $f$;""", '']
for s, t in data_tables:
    fq = f"{ident(s)}.{ident(t)}"
    r = Q(f"select count(*)::int n, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) rows from {fq} x")[0]
    rows = r['rows'] if isinstance(r['rows'], list) else json.loads(r['rows'])
    assert len(rows) == r['n'], (fq, len(rows), r['n'])
    counts[f'{s}.{t}'] = r['n']
    json.dump(rows, open(f'{OUT}/data/{s}.{t}.json', 'w'), ensure_ascii=False, indent=0, default=str)
    if rows:
        dat.append(f"select pg_temp._restore_json({lit(fq)}::regclass, {dq(json.dumps(rows, ensure_ascii=False, default=str))}::jsonb);")
dat.append('set session_replication_role = origin;')
open(f'{OUT}/data.sql', 'w').write('\n'.join(dat) + '\n')
json.dump(counts, open(f'{OUT}/counts.json', 'w'), indent=1)

meta = {
  'project_ref': 'wyjfgrgxmhumyzwcrywj',
  'server': Q("select version() v, current_user u, current_setting('transaction_read_only') ro, now()::text at")[0],
  'extensions': exts,
  'vault_secret_names_only': Q("select id, name, description, created_at::text from vault.secrets"),
  'counts_note': 'exact count(*) per table at dump time; also in counts.json',
  'tables': len(tables), 'functions': len(funcs), 'views': len(views), 'triggers': len(trg), 'policies': len(pols),
  'constraints': len(cons), 'indexes': len(idx),
}
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1, default=str)
print(json.dumps({k: v for k, v in meta.items() if k not in ('extensions','vault_secret_names_only')}, default=str))
