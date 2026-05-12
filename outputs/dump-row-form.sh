#!/usr/bin/env bash
# Dump the relevant section of the admin round page + the upsertRaceResult
# action signature so we can write a precise Phase 2 UI patch.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
ACTION='src/lib/actions/race-results.ts'

echo "=== Round page: lines 160-310 ==="
sed -n '160,310p' "$PAGE"

echo ""
echo "=== upsertRaceResult signature + first 80 lines ==="
sed -n '1,80p' "$ACTION"
