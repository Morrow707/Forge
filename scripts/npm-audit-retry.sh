#!/usr/bin/env bash
# npm audit, retried only when npm's audit SERVER fails to answer.
#
# A real advisory exits 1 with the advisory table and is reported on the
# first attempt -- this never retries that. What it retries is the registry
# side falling over ("npm error audit endpoint returned an error", seen as a
# 400 "Invalid package tree" on an unchanged lockfile five runs in a row on
# 2026-09-19 and gone twenty minutes later), which is not something a commit
# can fix and was paging the owner for nothing.
set -u
attempts=4
for i in $(seq 1 "$attempts"); do
  out=$(npm audit "$@" 2>&1)
  status=$?
  printf '%s\n' "$out"
  if [ "$status" -eq 0 ]; then exit 0; fi
  if ! printf '%s' "$out" | grep -q "audit endpoint returned an error"; then
    exit "$status"
  fi
  if [ "$i" -lt "$attempts" ]; then
    wait=$((15 * i))
    echo "npm audit server error (attempt $i of $attempts); retrying in ${wait}s"
    sleep "$wait"
  fi
done
echo "npm audit server kept failing after $attempts attempts"
exit 1
