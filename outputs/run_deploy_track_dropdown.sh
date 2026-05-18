#!/usr/bin/env bash
# Deploy: turn the track field on the Add / Edit round form into a
# closed <select> dropdown (was a typeahead with free-text fallback).
#
# Behaviour:
#  - Track dropdown lists every IracingTrack catalogue row, sorted
#    alphabetically. Native browser type-to-search works inside it.
#  - Picking a track populates the existing Variant <select> below.
#  - For Edit Round: if the round's saved track isn't in the cache
#    (e.g. legacy free-text entry), an extra "(not in catalogue)" option
#    is added at the top so the value is preserved on save.
#  - To add a track that's not in the dropdown, use the form on
#    /admin/iracing/tracks first (linked from the helper text below
#    the dropdown).
#
# No DB / schema changes — only the client component changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_track_dropdown.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/components/TrackSelect.tsx \
  outputs/run_deploy_track_dropdown.sh
git commit -m "TrackSelect: closed <select> dropdown, type-to-search

Replace the typeahead input with a native <select> listing all cached
iRacing tracks alphabetically. Browser type-to-search still works (you
can press 'm' to jump to Monza, etc.).

For edit-round mode, if the round's saved track isn't in the cache,
an extra '<name> (not in catalogue)' option is added at the top so
the existing value is preserved.

Helper text now points to /admin/iracing/tracks for adding missing
entries (matching the cars admin pattern)." || true
git push

echo "Done."
