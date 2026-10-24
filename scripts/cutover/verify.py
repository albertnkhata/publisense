"""Compare a local restore with production object by object (md5 of definitions, grants
and per-table row content). Production is read through sbq.q (read-only).
  python3 scripts/cutover/verify.py [local-db]"""
import json, os, subprocess, sys
from sbq import q
DB = sys.argv[1] if len(sys.argv) > 1 else 'restore_test'
def L(sql):
    out = subprocess.check_output(['psql','-h',os.environ.get('PGHOST','/tmp'),'-p',os.environ.get('PGPORT','54329'),'-U','postgres','-d',DB,'-qtA','-c','set search_path=pg_catalog','-c',f"select coalesce(json_agg(x),'[]') from ({sql}) x"], env={**os.environ, 'PATH': os.environ.get('PGBIN','/usr/lib/postgresql/17/bin') + ':/usr/bin:/bin'})
    return json.loads(out)
checks = {
 'functions': "select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(pg_get_functiondef(p.oid)) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ci_probe') and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')",
 'policies': "select schemaname||'.'||tablename||'.'||policyname k, md5(concat_ws('|',permissive,roles::text,cmd,qual,with_check)) v from pg_policies where schemaname in ('public','ci_probe') or (schemaname='storage' and tablename='objects')",
 'triggers': "select c.relnamespace::regnamespace::text||'.'||c.relname||'.'||t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and p.pronamespace::regnamespace::text in ('public','ci_probe')",
 'constraints': "select conrelid::regclass::text||'.'||conname k, md5(pg_get_constraintdef(oid)) v from pg_constraint where connamespace::regnamespace::text in ('public','ci_probe')",
 'indexes': "select indexrelid::regclass::text k, md5(pg_get_indexdef(indexrelid)) v from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace::regnamespace::text in ('public','ci_probe')",
 'rls': "select n.nspname||'.'||relname k, relrowsecurity::text||relforcerowsecurity::text v from pg_class c join pg_namespace n on n.oid=c.relnamespace where relkind='r' and n.nspname in ('public','ci_probe')",
 'table_grants': "select n.nspname||'.'||c.relname||'.'||coalesce(r.rolname,'PUBLIC') k, string_agg(a.privilege_type, ',' order by a.privilege_type) v from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a left join pg_roles r on r.oid=a.grantee where n.nspname in ('public','ci_probe') and c.relkind in ('r','v') and coalesce(r.rolname,'PUBLIC') in ('anon','authenticated','service_role','PUBLIC') group by 1",
 'column_grants': "select n.nspname||'.'||c.relname||'.'||t.attname||'.'||coalesce(r.rolname,'PUBLIC') k, string_agg(a.privilege_type, ',' order by a.privilege_type) v from pg_attribute t join pg_class c on c.oid=t.attrelid join pg_namespace n on n.oid=c.relnamespace, aclexplode(t.attacl) a left join pg_roles r on r.oid=a.grantee where n.nspname in ('public','ci_probe') and t.attacl is not null group by 1",
 'function_grants': "select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, (select string_agg(coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type, ',' order by 1) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid=a.grantee where coalesce(r.rolname,'PUBLIC') in ('anon','authenticated','service_role','PUBLIC')) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ci_probe') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')",
 'columns': "select table_schema||'.'||table_name||'.'||column_name k, md5(concat_ws('|',data_type,udt_name,is_nullable,column_default,is_generated)) v from information_schema.columns where table_schema in ('public','ci_probe')",
 'views': "select schemaname||'.'||viewname k, md5(definition) v from pg_views where schemaname in ('public','ci_probe')",
}
tabs = [r['t'] for r in q("select n.nspname||'.'||c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where relkind='r' and n.nspname in ('public','ci_probe')")]
tabs += ['storage.objects']
checks['buckets'] = "select id k, md5(concat_ws('|',name,public,file_size_limit,allowed_mime_types::text)) v from storage.buckets"
checks['row_hashes'] = ' union all '.join(f"select '{t}' k, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text),'')) v from {t} x" for t in tabs)
fail = 0; report = {}
for name, sql in checks.items():
    prod = {r['k']: r['v'] for r in q('set search_path=pg_catalog; ' + f"select coalesce(json_agg(x),'[]') j from ({sql}) x")[0]['j']} if False else None
    pr = q(f"set search_path=pg_catalog; select k, v from ({sql}) x")
    prod = {r['k']: r['v'] for r in pr}
    loc = {r['k']: r['v'] for r in L('set search_path=pg_catalog' if False else sql)}
    diff = sorted(k for k in set(prod) | set(loc) if prod.get(k) != loc.get(k))
    report[name] = {'prod': len(prod), 'local': len(loc), 'diff': diff[:20]}
    print(f"{name:16} prod={len(prod):4} local={len(loc):4} diffs={len(diff)}", diff[:6])
    fail += len(diff)
json.dump(report, open(os.environ.get('VERIFY_REPORT','verify_report.json'),'w'), indent=1)
sys.exit(1 if fail else 0)
