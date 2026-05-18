#!/usr/bin/env bash
# Deploy: surface the freshly-synced iRating / Safety Rating / license
# class fields on User in two places:
#
# 1. /admin/users — adds six new columns:
#    * SC iR   — Sports Car iRating
#    * SC SR   — Sports Car Safety Rating (2 decimals)
#    * SC Lic  — Sports Car license class (coloured pill)
#    * FC iR   — Formula Car iRating
#    * Oval iR — Oval iRating
#    * Synced  — last refresh date (full timestamp on hover)
#    The existing TableFilter on the page now also matches iRating /
#    license values, so "Class A" / "2500" filters work.
#
# 2. /drivers/[iracingMemberId] — adds a "Current iRacing licenses"
#    section above the career stats. Three side-by-side cards for
#    Sports Car / Formula / Oval, each with iRating + Safety Rating +
#    coloured license class (or muted if Rookie / no data). Header
#    line shows the last-synced date.
#
# Both views read fields populated by scripts/lm_apply_iratings.ts.
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_show_iratings.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/app/admin/users/page.tsx \
  "src/app/drivers/[iracingMemberId]/page.tsx" \
  outputs/run_deploy_show_iratings.sh
git commit -m "Display synced iRating fields on admin users + driver profile

* /admin/users gets six new columns (SC iR / SR / Lic, FC iR, Oval
  iR, Synced) plus a coloured pill component for license class. The
  existing TableFilter on the page now matches iRating + license too.
* /drivers/[iracingMemberId] gets a 'Current iRacing licenses'
  section above the career stats: three cards (Sports Car / Formula
  / Oval) with iRating, Safety Rating, and coloured license class.
  Section is hidden entirely when iracingLastSyncedAt is null." || true
git push

echo "Done."
