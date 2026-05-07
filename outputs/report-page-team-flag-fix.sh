#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx'

echo "=== 1. Show what's already fetched (lines 30-80) so I can pick the right anchor ==="
sed -n '30,80p' "$FILE"

echo ""
echo "=== 2. Add a fetch of season.teamRegistration if not already present ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Skip if already fetched
if (s.includes('teamRegistration: true')) {
  console.log('  season.teamRegistration already fetched somewhere.');
} else {
  // Most reliable: add a small fetch right before the roster query.
  // Anchor on `const roster = await prisma.registration.findMany`
  s = s.replace(
    /(const roster = await prisma\.registration\.findMany\()/,
    \`const seasonForFlag = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { teamRegistration: true },
  });
  \$1\`
  );
}

// Update the JSX prop to use seasonForFlag
s = s.replace(
  /teamMode=\{!!season\?\.teamRegistration\}/,
  'teamMode={!!seasonForFlag?.teamRegistration}'
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'seasonForFlag\|teamRegistration\|teamMode' "$FILE" | head -10

echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Report page: fetch seasonForFlag.teamRegistration to drive picker grouping"
git push

echo ""
echo "Done."
