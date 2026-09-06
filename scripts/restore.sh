#!/usr/bin/env bash
# Restore a backup taken by scripts/backup.sh into a target database.
#
# Deliberately awkward to point at production. A restore script that can
# clobber a live database on a mistyped argument is a bigger risk than the
# missing backups it was written to fix, so the target must be named
# explicitly and confirmed with --i-know-this-destroys-the-target.
#
#   ./scripts/restore.sh <dump-file> <target-database-url> [--i-know-this-destroys-the-target]
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file> <target-database-url> [--i-know-this-destroys-the-target]}"
TARGET="${2:?a target DATABASE_URL is required -- this never defaults to \$DATABASE_URL}"
CONFIRM="${3:-}"

[ -f "$DUMP" ] || { echo "No such dump: $DUMP" >&2; exit 1; }

echo "==> Dump contents"
pg_restore --list "$DUMP" | grep -c 'TABLE DATA' | xargs echo "    tables with data:"

EXISTING="$(psql "$TARGET" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)"
if [ "$EXISTING" -gt 0 ] && [ "$CONFIRM" != "--i-know-this-destroys-the-target" ]; then
  echo "REFUSING: the target already has $EXISTING tables in the public schema." >&2
  echo "Restoring over them replaces their contents. Re-run with --i-know-this-destroys-the-target if that is what you mean." >&2
  exit 1
fi

echo "==> Restoring"
# --clean --if-exists so a restore over an existing schema replaces it rather
# than erroring on every object; --no-owner/--no-privileges because the role
# names on a restore target are rarely the ones production used.
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET" "$DUMP" 2>&1 | tail -5 || true

echo "==> Verifying the restore landed"
ROWS="$(psql "$TARGET" -tAc "SELECT count(*) FROM users" 2>/dev/null || echo 0)"
echo "    users rows: $ROWS"
if [ "$ROWS" -lt 1 ]; then
  echo "FAILED: no users after restore. Do not treat this as a successful recovery." >&2
  exit 1
fi
echo "==> Restored. Uploaded files are a SEPARATE archive -- untar it into the"
echo "    service's uploads mount (render.yaml: disk.forge-uploads) or every"
echo "    video URL in this database points at nothing."
