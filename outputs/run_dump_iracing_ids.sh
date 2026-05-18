#!/usr/bin/env bash
# Step 1 of the iRating one-shot pull: query Neon for every User with
# an iracingMemberId set and write the list to outputs/iracing_ids.json.
# Claude reads that file and feeds the IDs to iRacing's BFF proxy.
#
# Network: needs Postgres 5432 → use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_dump_iracing_ids.sh
set -euo pipefail

cd "$(dirname "$0")/.."

npx tsx scripts/lm_dump_iracing_ids.ts
