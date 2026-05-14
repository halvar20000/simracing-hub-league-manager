#!/usr/bin/env bash
# Deploy: fix iRacing JSON parser so qualifying times are imported.
#
# Three bugs in src/lib/iracing-json.ts, all caught by inspecting the
# Watkins Glen R6 JSON:
#
#  1. Qualify session was filtered by simsession_type === 4, but real
#     events use type 5 (Open Qualifying). Accept both 4 and 5.
#  2. `qual_lap_time ?? best_qual_lap_time` never fell through because
#     iRacing sets -1 (not null) for unset fields. Try best_qual_lap_time
#     first via tenThousandthsToMs (which rejects <=0), then qual_lap_time.
#  3. For team events (IEC), the session.results rows are TEAM rows (no
#     cust_id); the actual drivers live in row.driver_results[]. The
#     existing filter `cust_id > 0` dropped all team rows. Now flatten
#     both shapes into a single driver list, falling back to team-row
#     fields where the driver row doesn't carry them.
#
# After deploy, re-import the IEC R6 Watkins Glen JSON; the qualifying
# section on the round page will populate.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_quali_parser_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/iracing-json.ts \
  outputs/run_deploy_iracing_quali_parser_fix.sh
git commit -m "iRacing JSON parser: accept Open Qualifying (type 5), fix -1 fallback, flatten team rows

Three bugs in src/lib/iracing-json.ts that together caused qualifying
times to never be imported for IEC team events:

1. Qualify session filter was simsession_type === 4 (Lone Qualifying)
   only; real IEC events use type 5 (Open Qualifying). Accept both.
2. \`qual_lap_time ?? best_qual_lap_time\` never fell through because
   iRacing returns -1 (not null) for unset fields. Try
   best_qual_lap_time first via tenThousandthsToMs (which rejects
   non-positive), then qual_lap_time.
3. For team sessions, results rows are teams (no cust_id); drivers
   live in row.driver_results[]. The existing filter dropped all team
   rows. Flatten both solo and team shapes into a single ParsedDriver
   list, using driver-level values where present and falling back to
   the team row otherwise.

Verified against the Watkins Glen R6 export: 45/45 drivers now extract
with real qualifying times (pole 1:34.397)." || true
git push

echo ""
echo "Deploy pushed. Re-import the IEC R6 JSON to populate qualifyingTimeMs"
echo "on the existing RaceResult rows, then the Qualifying section on the"
echo "round page will show real times."
