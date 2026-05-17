#!/usr/bin/env bash
# Commit-only: stage the in-working-tree change to src/lib/iracing-json.ts
# (adds ParsedTeam + ParsedSession.teams[] in preparation for the parked
# IEC TeamResult import work). Pure parser extension — no consumer touches
# the new field today, so this is a no-op behaviourally. Just keeps the
# working tree clean.
#
# Run from your Mac terminal:
#   bash outputs/run_commit_parser_team_parking.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add src/lib/iracing-json.ts outputs/run_commit_parser_team_parking.sh
git commit -m "iracing-json: add ParsedTeam (parked IEC team-import work)

Adds a ParsedTeam interface and populates a teams[] array on each
ParsedSession when the iRacing event JSON contains top-level team
rows (i.e. team-mode events with driver_results nested inside each
team). Nothing currently consumes the new field — the importer side
of the IEC TeamResult work is still parked — but committing the
parser piece prevents the change from drifting in the working tree
and makes resuming the work later a one-step job." || true
git push

echo "Done."
