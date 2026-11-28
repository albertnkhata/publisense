# Database and Storage backups

`.github/workflows/backup.yml` runs every night at 02:23 CAT (00:23 UTC; off-peak minute, see #146)
and keeps 30 days of encrypted copies as Actions artifacts named `publisense-db-<UTC stamp>`.
Run it by hand from **Actions → Nightly backup → Run workflow**.

Each nightly artifact contains two AES-256 GPG-encrypted files from the same snapshot timestamp:
1. **`publisense-<stamp>.dump.gpg`** — Postgres custom-format dump (`pg_dump`) covering `public` (all app data), `private` (RLS/check helpers and first-party analytics), `auth` (accounts), `storage` (bucket & object metadata), and `supabase_migrations`.
2. **`publisense-storage-<stamp>.tar.gz.gpg`** — All media files from Supabase Storage buckets (`avatars`, `board-logos`, `post-images`) plus `manifest.tsv` (byte sizes + SHA-256) and `manifest.sha256` (#319).

The repo is public, so every archive is encrypted with `BACKUP_PASSPHRASE`. Lose the passphrase
and the backups are unreadable: keep a copy outside GitHub.

---

## Manual DB-only decrypt & inspect

```bash
gpg --decrypt publisense-<stamp>.dump.gpg > db.dump      # asks for BACKUP_PASSPHRASE
pg_restore --list db.dump | less                          # inspect first
# Into a fresh project or a scratch database, never straight over production:
pg_restore --no-owner --no-privileges --schema=public --data-only -d "$TARGET_DB_URL" db.dump
```

Restore `public` data into a database that already has the schema (`supabase/schema.sql` plus
migrations), or restore schema and data together into an empty scratch database to read from.

---

## Full isolated restore drill (DB + Storage media, #319)

Never run a restore drill against production. Provision an isolated scratch Supabase project with
`supabase/schema.sql` + `supabase/migrations/*.sql` applied, download a recent `publisense-db-<stamp>`
artifact, and run [`scripts/restore-drill.sh`](../scripts/restore-drill.sh):

```bash
BACKUP_PASSPHRASE='...' bash scripts/restore-drill.sh \
  --db-gpg ./publisense-<stamp>.dump.gpg \
  --storage-gpg ./publisense-storage-<stamp>.tar.gz.gpg \
  --target-db-url "$SCRATCH_DB_URL" \
  --target-supabase-url "https://<scratch-ref>.supabase.co" \
  --target-service-role-key "$SCRATCH_SERVICE_ROLE_KEY" \
  --prod-ref "<production-project-ref>"
```

The script:
1. Refuses to run if the target matches `--prod-ref` or `publisense.app`.
2. Decrypts both archives into a temp dir (auto-cleaned on exit).
3. Verifies every Storage file against `manifest.sha256`.
4. Restores `public` data into the isolated scratch database.
5. Uploads every Storage object to the scratch project's buckets and re-fetches each public URL to verify HTTP `200`, byte size, and SHA-256 match.
6. Prints referenced media counts (`board.logo_path`, `profile.avatar_path`, `post.images`) and total elapsed seconds so you can record the drill evidence on #319.
