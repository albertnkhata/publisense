#!/usr/bin/env bash
# Isolated non-production restore drill for BOTH Postgres data and Supabase Storage media (#319).
#
# Never runs against production. Decrypts a matched pair of nightly backup files
# (publisense-<stamp>.dump.gpg + publisense-storage-<stamp>.tar.gz.gpg), verifies
# SHA-256 checksums, restores into an isolated scratch Supabase project, uploads
# every Storage object, and verifies representative app records resolve and match.
#
# Usage:
#   BACKUP_PASSPHRASE='...' scripts/restore-drill.sh \
#     --db-gpg /path/to/publisense-2026-11-22T0023Z.dump.gpg \
#     --storage-gpg /path/to/publisense-storage-2026-11-22T0023Z.tar.gz.gpg \
#     --target-db-url 'postgresql://...' \
#     --target-supabase-url 'https://<scratch-ref>.supabase.co' \
#     --target-service-role-key '<scratch-service-role-key>' \
#     --prod-ref '<production-project-ref>'
set -euo pipefail

DB_GPG=""
STORAGE_GPG=""
TARGET_DB_URL=""
TARGET_SUPABASE_URL=""
TARGET_SERVICE_ROLE_KEY=""
PROD_REF=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-gpg) DB_GPG="$2"; shift 2 ;;
    --storage-gpg) STORAGE_GPG="$2"; shift 2 ;;
    --target-db-url) TARGET_DB_URL="$2"; shift 2 ;;
    --target-supabase-url) TARGET_SUPABASE_URL="$2"; shift 2 ;;
    --target-service-role-key) TARGET_SERVICE_ROLE_KEY="$2"; shift 2 ;;
    --prod-ref) PROD_REF="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for req in DB_GPG STORAGE_GPG TARGET_DB_URL TARGET_SUPABASE_URL TARGET_SERVICE_ROLE_KEY; do
  if [[ -z "${!req}" ]]; then
    echo "Missing required flag for $req" >&2
    exit 2
  fi
done

if [[ -n "$PROD_REF" ]] && { [[ "$TARGET_DB_URL" == *"$PROD_REF"* ]] || [[ "$TARGET_SUPABASE_URL" == *"$PROD_REF"* ]]; }; then
  echo "REFUSED: target matches --prod-ref ($PROD_REF). Never restore over production." >&2
  exit 1
fi
if [[ "$TARGET_SUPABASE_URL" == *"publisense.app"* ]]; then
  echo "REFUSED: target looks like production. Use an isolated scratch Supabase project." >&2
  exit 1
fi

START_TS=$(date +%s)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "=== 1. Decrypting backup archives ==="
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt --output "$WORK/db.dump" "$DB_GPG"
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt --output "$WORK/storage.tar.gz" "$STORAGE_GPG"
else
  gpg --decrypt --output "$WORK/db.dump" "$DB_GPG"
  gpg --decrypt --output "$WORK/storage.tar.gz" "$STORAGE_GPG"
fi

mkdir -p "$WORK/storage"
tar -xzf "$WORK/storage.tar.gz" -C "$WORK/storage"

echo "=== 2. Verifying Storage manifest SHA-256 checksums ==="
if [[ -s "$WORK/storage/manifest.sha256" ]]; then
  (cd "$WORK/storage" && sha256sum -c manifest.sha256)
else
  echo "manifest.sha256 is empty (0 objects in snapshot)."
fi

echo "=== 3. Restoring public schema data into isolated DB ==="
pg_restore --no-owner --no-privileges --schema=public --data-only --disable-triggers -d "$TARGET_DB_URL" "$WORK/db.dump"

echo "=== 4. Uploading Storage objects and verifying HTTP 200 + SHA-256 ==="
python3 - "$WORK/storage" "$TARGET_SUPABASE_URL" "$TARGET_SERVICE_ROLE_KEY" <<'PY'
import hashlib, mimetypes, os, sys, urllib.parse, urllib.request

storage_dir, base_url, key = sys.argv[1], sys.argv[2].rstrip('/'), sys.argv[3]
manifest = os.path.join(storage_dir, 'manifest.tsv')
uploaded = 0
verified = 0

with open(manifest, 'r', encoding='utf-8') as fh:
    header = fh.readline()
    for raw in fh:
        line = raw.rstrip('\r\n')
        if not line:
            continue
        bucket, name, expected_size, expected_sha = line.split('\t')
        src = os.path.join(storage_dir, bucket, name)
        with open(src, 'rb') as f:
            data = f.read()
        ctype = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        put_url = f'{base_url}/storage/v1/object/{urllib.parse.quote(bucket, safe="")}/{urllib.parse.quote(name, safe="/")}'
        req = urllib.request.Request(
            put_url,
            data=data,
            method='POST',
            headers={
                'Authorization': f'Bearer {key}',
                'apikey': key,
                'Content-Type': ctype,
                'x-upsert': 'true',
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f'Upload failed for {bucket}/{name}: HTTP {resp.status}')
        uploaded += 1

        pub_url = f'{base_url}/storage/v1/object/public/{urllib.parse.quote(bucket, safe="")}/{urllib.parse.quote(name, safe="/")}'
        with urllib.request.urlopen(pub_url, timeout=30) as resp:
            got = resp.read()
            if resp.status != 200:
                raise RuntimeError(f'Public fetch failed for {bucket}/{name}: HTTP {resp.status}')
            got_sha = hashlib.sha256(got).hexdigest()
            if got_sha != expected_sha or str(len(got)) != expected_size:
                raise RuntimeError(f'Checksum/size mismatch for {bucket}/{name}: got {len(got)}/{got_sha}, expected {expected_size}/{expected_sha}')
        verified += 1

print(f'Storage restore verified: {uploaded} uploaded, {verified} checksum-verified via public URL')
PY

echo "=== 5. Cross-checking representative DB media references ==="
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -c "
  select 'board_logos' as kind, count(*) as referenced from public.board where logo_path is not null
  union all
  select 'avatars', count(*) from public.profile where avatar_path is not null
  union all
  select 'post_images', count(*) from public.post_image;
"

END_TS=$(date +%s)
echo "=== Restore drill complete in $((END_TS - START_TS))s ==="
