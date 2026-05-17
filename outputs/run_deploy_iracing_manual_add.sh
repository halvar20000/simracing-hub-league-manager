#!/usr/bin/env bash
# Deploy: let admins add iRacing tracks + variants by hand from the
# /admin/iracing/tracks page when iRacing releases a new track that's
# not yet in the curated JSON.
#
# Changes:
#  - New server actions in src/lib/actions/iracing-tracks.ts:
#      * addIracingTrackManually  — allocates a synthetic ID at 10001+
#        so it can't collide with JSON seed (9001–9999) or future real
#        iRacing IDs (which are well below 1000).
#      * deleteIracingTrack       — remove a row (typo fix, or strip a
#        track you no longer want).
#  - Admin page redesigned: shows ALL cached tracks in a table (was
#    only the first 20), has a TableFilter search box, an "Add a track"
#    form, and per-row 'manual'/'seed' badges + a Delete button.
#  - Seed action's behaviour unchanged — it still leaves manual rows
#    (≥ 10001) alone, so re-seeding doesn't wipe your hand-added rows.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_manual_add.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/actions/iracing-tracks.ts \
  "src/app/admin/iracing/tracks/page.tsx" \
  outputs/run_deploy_iracing_manual_add.sh
git commit -m "iRacing tracks admin: add/delete tracks manually

When iRacing releases a new track before the curated JSON seed catches
up, admins can now add the track + variant from the page directly.
Two new server actions:

* addIracingTrackManually — allocates a synthetic ID in the 10001+
  range, idempotent on (trackName, configName) case-insensitive so
  re-submitting just refreshes the row.
* deleteIracingTrack — remove a row (typo, or no longer wanted).

Page UI:
* Full table of all cached tracks (was previously first 20).
* TableFilter search box for finding a track quickly.
* 'manual' / 'seed' badge per row so admins can tell what came from
  the JSON file vs hand-added.
* Delete button per row.

Seed action's range protection unchanged — it leaves rows ≥ 10001
alone, so 'Seed from JSON' doesn't wipe manual additions." || true
git push

echo "Done."
