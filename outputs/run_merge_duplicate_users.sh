#!/usr/bin/env bash
# Find Discord-login + admin-registered user pairs by name and merge them.
# Moves the Discord Account onto the admin user (so future logins resolve
# to the user that actually has the registration), then deletes the
# Discord-only User row.
#
# Step 1 (dry run): bash outputs/run_merge_duplicate_users.sh
# Step 2 (apply):   APPLY=1 bash outputs/run_merge_duplicate_users.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${APPLY:-0}" = "1" ]; then
  echo ">>> APPLY mode — duplicate users will be merged"
  APPLY=1 npx tsx scripts/lm_merge_duplicate_users.ts
else
  echo ">>> Dry run — no changes will be made"
  npx tsx scripts/lm_merge_duplicate_users.ts
fi
