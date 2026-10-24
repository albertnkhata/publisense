#!/bin/bash
# Restore a logical backup made by dump.py into a scratch LOCAL Postgres 17 database and
# compare every table's row count with counts.json. Never points at production.
#   scripts/cutover/restore.sh <backup-dir> [db-name]
# Env: PGHOST (default /tmp), PGPORT (default 54329), PGBIN (default Debian postgresql-17).
set -euo pipefail
B=$1; DB=${2:-restore_test}
export PATH=${PGBIN:-/usr/lib/postgresql/17/bin}:$PATH
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-54329}
P="psql -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f "$(dirname "$0")/restore_harness.sql"
$P -d "$DB" -1 -f "$B/schema.sql"
$P -d "$DB" -1 -f "$B/data.sql" >/dev/null
python3 - "$B" "$DB" <<'PY'
import json, subprocess, sys
B, DB = sys.argv[1:3]; c = json.load(open(f'{B}/counts.json')); bad = 0
for t, n in c.items():
    s, r = t.split('.')
    got = int(subprocess.check_output(['psql', '-U', 'postgres', '-d', DB, '-tAc', f'select count(*) from "{s}"."{r}"']).strip())
    if got != n: bad += 1; print('MISMATCH', t, n, got)
print(f'{len(c)} tables compared, {bad} mismatches'); sys.exit(1 if bad else 0)
PY
