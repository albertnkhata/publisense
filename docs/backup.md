# Database backups

`.github/workflows/backup.yml` dumps production every night at 02:30 CAT (00:30 UTC)
and keeps 30 days of encrypted copies as Actions artifacts named `publisense-db-<UTC stamp>`.
Run it by hand from **Actions → Nightly backup → Run workflow**.

Covered schemas: `public` (all app data), `auth` (accounts), `storage` (file metadata; the
logo and avatar files themselves live in Supabase Storage and are not in the dump),
`supabase_migrations`.

The repo is public, so every dump is encrypted with `BACKUP_PASSPHRASE`. Lose the passphrase
and the backups are unreadable: keep a copy outside GitHub.

## Restore

```bash
gpg --decrypt publisense-<stamp>.dump.gpg > db.dump      # asks for BACKUP_PASSPHRASE
pg_restore --list db.dump | less                          # inspect first
# Into a fresh project or a scratch database, never straight over production:
pg_restore --no-owner --no-privileges --schema=public --data-only -d "$TARGET_DB_URL" db.dump
```

Restore `public` data into a database that already has the schema (`supabase/schema.sql` plus
migrations), or restore schema and data together into an empty scratch database to read from.
