#!/usr/bin/env bash
# Deploy: add iRating / Safety Rating / license class fields on User
# for Sports Car, Formula Car, and Oval categories, plus an
# iracingLastSyncedAt timestamp.
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_irating_schema.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: User iRating fields)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push"
git add \
  prisma/schema.prisma \
  scripts/lm_dump_iracing_ids.ts \
  scripts/lm_apply_iratings.ts \
  outputs/run_deploy_irating_schema.sh \
  outputs/run_dump_iracing_ids.sh \
  outputs/run_apply_iratings.sh
git commit -m "User: per-category iRating / SR / license class snapshots

Adds three sets of fields on User: iratingSportsCar / formulaCar /
Oval, plus matching safetyRating + licenseClass strings, plus an
iracingLastSyncedAt timestamp. Populated by a one-shot pull from
iRacing's /data/member/get?include_licenses=true via the Chrome MCP
(Claude reads outputs/iracing_ids.json, fetches member data through
the BFF proxy, writes outputs/iracing_irating_data.json, then the
admin runs scripts/lm_apply_iratings.ts to update DB rows).

The legacy Registration.iRating field is left alone — it's still the
per-season snapshot captured at registration time." || true
git push

echo
echo "Done. Next steps:"
echo "  1. bash outputs/run_dump_iracing_ids.sh"
echo "  2. Tell Claude 'iracing_ids.json is ready'"
echo "  3. Claude fetches via Chrome MCP and writes"
echo "     outputs/iracing_irating_data.json"
echo "  4. bash outputs/run_apply_iratings.sh   (dry run)"
echo "  5. APPLY=1 bash outputs/run_apply_iratings.sh  (commit changes)"
