#!/usr/bin/env bash
# Fix: iRacing JSON import P2002 crash. The auto-resolve-car step
# tried to CREATE a new Car when a car with the same name already
# existed in the season (typically because it was copied via "Copy
# from previous season" without an iracingCarId). Now we look up by
# name as a fallback before creating, and backfill the iracingCarId.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_import_car_name_match.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/iracing-json-import.ts \
  outputs/run_deploy_iracing_import_car_name_match.sh
git commit -m "iRacing JSON import: match cars by name before creating

The auto-resolve path crashed with P2002 unique-constraint failure when
a Car with the same name already existed in the season (typically from
the 'Copy from previous season' button, which doesn't carry an
iracingCarId, so the (seasonId, iracingCarId) lookup missed and the
follow-up create hit the (carClassId, name) unique).

Add a (seasonId, name) lookup between the iRacing-id lookup and the
create. On match, backfill the iracingCarId so subsequent imports
hit the fast path." || true
git push

echo "Done. After Vercel deploys, retry the JSON import."
