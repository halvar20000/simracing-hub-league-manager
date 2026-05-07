#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'

echo "=== Type the Maps so members.map gets a typed parameter ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Replace 'new Map()' inline initializations with typed versions.
// Uses 'typeof accusedDrivers' for the value type (accusedDrivers is in scope).
s = s.replace(
  /\}, new Map\(\)\s*\)/g,
  '}, new Map<string, typeof accusedDrivers>())'
);

if (s === before) {
  console.error('  No replacements made.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'new Map<string,' "$FILE" | head -3

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
git commit -m "Steward report: type the Map so members.map has a typed parameter"
git push

echo ""
echo "Done."
