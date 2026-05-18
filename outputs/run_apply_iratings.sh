#!/usr/bin/env bash
# Step 3 of the iRating one-shot pull: read outputs/iracing_irating_data.json
# (Claude-produced) and update each User's iRating / Safety Rating /
# license class for Sports Car, Formula Car, and Oval.
#
# Step 1 (dry run): bash outputs/run_apply_iratings.sh
# Step 2 (apply):   APPLY=1 bash outputs/run_apply_iratings.sh
#
# Network: needs Postgres 5432 → use phone hotspot.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${APPLY:-0}" = "1" ]; then
  echo ">>> APPLY mode — User rows will be updated"
  APPLY=1 npx tsx scripts/lm_apply_iratings.ts
else
  echo ">>> Dry run — no changes will be made"
  npx tsx scripts/lm_apply_iratings.ts
fi
