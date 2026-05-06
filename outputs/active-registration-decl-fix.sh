#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'

echo "=== Insert missing const activeRegistration = ... ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

if (s.includes('const activeRegistration =')) {
  console.log('  Already present.');
  process.exit(0);
}

// Anchor on the leaderTeamId line (which already references activeRegistration)
// and insert the declaration just before it.
s = s.replace(
  /(const leaderTeamId = activeRegistration\?\.teamId \?\? null;)/,
  \`const activeRegistration =
      existing && existing.status !== \"WITHDRAWN\" && existing.status !== \"REJECTED\"
        ? existing
        : null;
    \$1\`
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
grep -n 'const activeRegistration\|const leaderTeamId' "$FILE" | head -5

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
git commit -m "Register page: declare activeRegistration before it's referenced (the previous patch's anchor for the declaration missed)"
git push

echo ""
echo "Done."
