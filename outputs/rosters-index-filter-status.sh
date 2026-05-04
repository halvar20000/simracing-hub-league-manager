#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/rosters/page.tsx'

echo "=== Patch /rosters to only list ACTIVE + OPEN_REGISTRATION seasons ==="
cat > /tmp/lm_rosters_filter.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add a where filter on the seasons include
s = s.replace(
  /seasons: \{\s*\n\s*orderBy: \[\{ year: "desc" \}, \{ name: "asc" \}\],\s*\n\s*\}/,
  `seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: [{ year: "desc" }, { name: "asc" }],
      }`
);

// (b) Hide leagues that end up with zero seasons after filtering
s = s.replace(
  /\{leagues\.map\(\(league\) => \(/,
  `{leagues
            .filter((league) => league.seasons.length > 0)
            .map((league) => (`
);

if (s === before) {
  console.error('  Anchors not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_rosters_filter.js "$FILE"

echo ""
echo "-- Verify --"
grep -n 'OPEN_REGISTRATION\|filter((league)' "$FILE" | head -5

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
git commit -m "Public /rosters: hide DRAFT and COMPLETED seasons, list only OPEN_REGISTRATION + ACTIVE"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then /rosters will only show seasons that are OPEN_REGISTRATION or ACTIVE,"
echo "and leagues with no qualifying seasons will be hidden entirely (no empty"
echo "league sections)."
