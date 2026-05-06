#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/links/page.tsx'

echo "=== Fix isCompleted check (avoid narrowing on unknown enum literals) ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;
s = s.replace(
  /const isCompleted =\s*\n\s*s\.status === \"COMPLETED\" \|\| s\.status === \"ARCHIVED\";/,
  'const isCompleted =\n                s.status !== \"OPEN_REGISTRATION\" && s.status !== \"ACTIVE\";'
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
grep -n 'isCompleted' "$FILE" | head -3

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
git commit -m "Admin links page: invert isCompleted check to avoid SeasonStatus literal narrowing"
git push

echo ""
echo "Done."
