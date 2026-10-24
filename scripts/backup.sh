#!/usr/bin/env bash
# Take a restorable backup of everything Forge cannot rebuild.
#
# There was no backup tooling in this repo and no restore procedure anywhere,
# including in the incident-response plan, whose own "known gaps" appendix did
# not list it either. That plan covers containment of a compromise -- rotate
# the credential, invalidate the sessions -- and says nothing about recovering
# from destruction, which is the other half.
#
# TWO stores, and a database backup alone covers only one of them:
#   1. Postgres (render.yaml: databases.forge-db) -- every account, program,
#      log, and the URL of every video.
#   2. The uploads disk (render.yaml: disk.forge-uploads, mounted at
#      /var/data/forge-uploads) -- the video FILES themselves. Restoring the
#      database without these leaves every athlete's video bank pointing at
#      files that no longer exist.
#
# Run this from somewhere that is NOT the production host. A backup written to
# the same disk it is backing up shares that disk's failure, and is a copy
# rather than a backup.
#
#   DATABASE_URL=postgres://... ./scripts/backup.sh /path/to/output [uploads-dir]
set -euo pipefail

OUT_DIR="${1:?usage: backup.sh <output-dir> [uploads-dir]}"
UPLOADS_DIR="${2:-}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$OUT_DIR/forge-db-$STAMP.dump"

# ENCRYPTED AT REST WHEN A PASSPHRASE IS SET. The dump holds every account, every minor's date
# of birth, every consent record and the path of every video; the archive holds the videos. A
# backup written in the clear to a laptop or a bucket is a second copy of the most sensitive
# data Forge has, outside every control the live service applies (2026-10-24 security audit).
# With BACKUP_ENCRYPTION_PASSPHRASE set, both files are written through
# `openssl enc -aes-256-cbc -pbkdf2` and carry a .enc suffix; restore with
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in X.enc -out X
# Without it the script still runs, says so loudly, and writes plaintext -- a dev box taking a
# throwaway copy should not be refused, a production operator should not be able to miss it.
ENCRYPT=0
if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  ENCRYPT=1
  command -v openssl >/dev/null || { echo "FAILED: BACKUP_ENCRYPTION_PASSPHRASE is set but openssl is not installed." >&2; exit 1; }
else
  echo "==> WARNING: BACKUP_ENCRYPTION_PASSPHRASE is not set. This backup is written IN THE CLEAR."
  echo "    Set it for any copy that leaves the production host."
fi

encrypt_file() {
  # $1: plaintext path. Replaces it with $1.enc and removes the plaintext.
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$1" -out "$1.enc"
  rm -f "$1"
}

echo "==> Dumping Postgres"
# Custom format (-Fc), which is what pg_restore reads: compressed, and it can
# be restored selectively or in parallel. A plain SQL dump cannot.
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"

echo "==> Verifying the dump is readable"
# A dump nobody has read is a file, not a backup. This is cheap and catches a
# truncated or half-written file now rather than during an actual restore.
# Verified BEFORE encryption, on the plaintext that is about to be removed.
TABLES="$(pg_restore --list "$DUMP" | grep -c 'TABLE DATA' || true)"
if [ "$TABLES" -lt 1 ]; then
  echo "FAILED: the dump contains no table data. Refusing to call this a backup." >&2
  exit 1
fi
echo "    $TABLES tables with data, $(du -h "$DUMP" | cut -f1)"
if [ "$ENCRYPT" = 1 ]; then
  encrypt_file "$DUMP"
  echo "    encrypted: $DUMP.enc"
fi

if [ -n "$UPLOADS_DIR" ]; then
  if [ ! -d "$UPLOADS_DIR" ]; then
    echo "FAILED: uploads directory '$UPLOADS_DIR' does not exist." >&2
    exit 1
  fi
  ARCHIVE="$OUT_DIR/forge-uploads-$STAMP.tar.gz"
  echo "==> Archiving uploaded files"
  tar -czf "$ARCHIVE" -C "$UPLOADS_DIR" .
  echo "    $(du -h "$ARCHIVE" | cut -f1)"
  if [ "$ENCRYPT" = 1 ]; then
    encrypt_file "$ARCHIVE"
    echo "    encrypted: $ARCHIVE.enc"
  fi
else
  echo "==> No uploads directory given -- DATABASE ONLY."
  echo "    Every video file is excluded from this backup. Restoring it would"
  echo "    leave the video bank pointing at files that do not exist."
fi

echo "==> Done: $OUT_DIR"
