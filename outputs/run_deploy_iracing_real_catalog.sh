#!/usr/bin/env bash
# Deploy: replace the curated/synthetic iRacing seed files with the
# REAL iRacing catalogues — pulled from your logged-in browser session
# via the /bff/pub/proxy/data/{car,track}/get BFF endpoint that
# members-ng.iracing.com's own SPA uses.
#
# All IDs are now real iRacing IDs (no more 9001+/99001+ synthetic
# placeholders for the seed). The MANUAL_BASE thresholds in the action
# code (track: 10001+, car: 100001+) stay valid because real iRacing
# IDs are < 1000.
#
# src/data/iracing-cars.json   : 181 cars  (non-retired)
# src/data/iracing-tracks.json : 424 tracks (non-retired)
#
# After deploy:
#   1) /admin/iracing/tracks → click "Seed from JSON" → upserts 424 rows
#   2) /admin/iracing/cars   → click "Seed from JSON" → upserts 181 rows
#
# Any previously-seeded rows with synthetic IDs (9001+ for tracks,
# 99001+ for cars) will NOT be removed automatically. Click Delete on
# them in the admin UI to clean up; they're flagged with a 'best-effort'
# badge (for cars) or just left at 9xxx IDs (for tracks).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_real_catalog.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/data/iracing-cars.json \
  src/data/iracing-tracks.json \
  outputs/run_deploy_iracing_real_catalog.sh
git commit -m "iRacing seed: full real catalogue via logged-in browser session

Replaced the curated/synthetic seed files with the actual iRacing
catalogues pulled from members-ng.iracing.com's BFF endpoint while
Thomas was logged in (Chrome MCP session):

* src/data/iracing-cars.json   — 181 non-retired cars, real iRacing IDs
* src/data/iracing-tracks.json — 424 non-retired track variants, real
  iRacing IDs

All seed IDs are now genuine, so when iRacing's race-result JSON
imports reference a car_id / track_id, our catalogue matches without
any guessing. No more 9001+/99001+ synthetic placeholders for the
seed rows.

Manual-ID thresholds in the server actions stay valid because real
iRacing IDs are well below 1000 (tracks max ~600, cars max ~211)." || true
git push

echo "Done."
echo
echo "Next steps after Vercel finishes:"
echo "  1. /admin/iracing/tracks → click 'Seed from JSON' (424 rows)"
echo "  2. /admin/iracing/cars   → click 'Seed from JSON' (181 rows)"
echo "  3. Optional: in the tracks table, filter for ID < 9000 to spot"
echo "     any leftover synthetic rows (9001-9100) from the previous"
echo "     seed and click Delete to remove them."
