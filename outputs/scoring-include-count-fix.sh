#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/scoring-systems/[id]/edit/page.tsx'

echo "=== Restore _count alongside seasons in the scoringSystem include ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Replace the current include block with one that has BOTH _count AND seasons.
s = s.replace(
  /include: \{\s*\n?\s*seasons: \{ select: \{ teamRegistration: true \} \},\s*\n?\s*\},/,
  \`include: {
      _count: { select: { seasons: true } },
      seasons: { select: { teamRegistration: true } },
    },\`
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
grep -n '_count\|seasons:' "$FILE" | head -5

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
git commit -m "Scoring-system edit fetch: keep _count when adding seasons include"
git push

echo ""
echo "Done."
