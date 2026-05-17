#!/usr/bin/env bash
# Fix-up: make sure no leftover `garage61Url` reference is in the source
# tree, then re-commit + push. Vercel was still building an earlier
# commit that had `<Garage61Link url={reg.user.garage61Url} />` in the
# admin roster team-mode block.
#
# Run from your Mac terminal:
#   bash outputs/run_fix_garage61_tsc.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  Scan for any remaining 'garage61Url' references in src/"
# Allowed: the doc comment line inside Garage61Link.tsx itself.
LEFTOVERS=$(
  grep -RIn "garage61Url" src/ \
    --include='*.ts' --include='*.tsx' \
  | grep -v "src/components/Garage61Link.tsx:" \
  || true
)
if [ -n "$LEFTOVERS" ]; then
  echo "ERROR: still found 'garage61Url' references outside the component:"
  echo "$LEFTOVERS"
  exit 1
fi
echo "  clean."

echo "==> 2/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 3/4  Stage + commit any pending changes"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  src/app/profile/page.tsx \
  src/lib/actions/profile.ts \
  prisma/schema.prisma \
  outputs/run_fix_garage61_tsc.sh

if git diff --cached --quiet; then
  echo "  nothing staged — local state already matches HEAD."
  echo "  Try retriggering the Vercel build (Vercel dashboard → Redeploy)"
  echo "  or making a trivial commit to force a rebuild."
  exit 0
fi

git commit -m "Garage 61: strip last per-driver references (Vercel build fix)

The previous Garage 61 commit on main still had a leftover
<Garage61Link url={reg.user.garage61Url} /> in the admin roster
team-mode block and references to the (now-deleted) User.garage61Url
field in the profile form / action. Removing them so Vercel's tsc
step passes." || true

echo "==> 4/4  Push (Vercel auto-deploys main)"
git push

echo "Done."
