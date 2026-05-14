#!/usr/bin/env bash
# Deploy: IEC team-event rounds now use flat columnar tables (matching the
# requested mock):
#   Pos | Team | Qualy Lap | Fastest Lap | Avg. Lap | Interval | Laps Lead
#       | Laps Compl. | Race Pts. | Bonus Pts. | Pen.
#
# Race table sorted by classPosition; Qualifying table sorted by best
# qualifying time across the team's drivers. Quali lookups now go via
# TeamResult.participations → RaceResult (the correct path for IEC),
# not via Registration.team which can be null in team-mode seasons.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iec_team_tables.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_iec_team_tables.sh
git commit -m "Round results: flat team race+quali tables for IEC

Replace the card-style RoundTeamSection / simple RoundTeamQualifyingTable
with two flat columnar tables (RoundTeamRaceTable, RoundTeamQualiTable)
matching the league-page mock. Columns: Pos, Team, Qualy Lap, Fastest
Lap, Avg Lap, Interval, Laps Lead, Laps Compl, Race Pts, Bonus Pts, Pen.

Quali aggregation now goes via TeamResult.participations -> RaceResult
(the correct path for IEC team-mode seasons), not via
Registration.team.name which can be null.

Race table sorts by classPosition; Quali table sorts by best
qualifyingTimeMs across the team's drivers. If no quali times exist for
the class, a clear message replaces the table." || true
git push

echo "Done."
