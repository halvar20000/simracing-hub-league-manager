#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/page.tsx'

echo "=== Patch league page count to exclude WITHDRAWN/REJECTED ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;
s = s.replace(
  /_count: \{ select: \{ rounds: true, registrations: true \} \},/,
  '_count: { select: { rounds: true, registrations: { where: { status: { in: [\"APPROVED\", \"PENDING\"] } } } } },'
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n '_count:.*registrations' "$FILE" | head -3

echo ""
echo "=== Sanity-check the totals computed on the page (sum) ==="
grep -n 'sum + s._count.registrations\|+ s\._count\.registrations' "$FILE" | head -3
echo "(those will also drop withdrawn rows automatically since they sum the new filtered count)"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Public league page: count only APPROVED + PENDING registrations per season (was counting WITHDRAWN too)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo "After deploy, /leagues/cas-iec will show 0 drivers on Season 4."
