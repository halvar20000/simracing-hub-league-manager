#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'

echo "=== Patch: include team on existing-registration query ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Match the existing findUnique without an include and add include: { team: true }.
s = s.replace(
  /prisma\.registration\.findUnique\(\{\s*\n\s*where: \{ seasonId_userId: \{ seasonId, userId: session\.user\.id \} \},\s*\n\s*\}\)/,
  \`prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId, userId: session.user.id } },
      include: { team: true },
    })\`
);

if (s === before) {
  console.error('  Anchor not found — query may already include team or have different shape.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'findUnique({\|include: { team' "$FILE" | head -5

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
git commit -m "Register page: include existing.team so team-mode form can pre-fill team name"
git push

echo ""
echo "Done."
