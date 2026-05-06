#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'

echo "=== Hoist activeRegistration to top-level scope ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// (a) Remove the in-block declaration (it sits just before leaderTeamId).
s = s.replace(
  /\s*const activeRegistration =\s*\n\s*existing && existing\.status !== \"WITHDRAWN\" && existing\.status !== \"REJECTED\"\s*\n\s*\? existing\s*\n\s*: null;\s*\n\s*const leaderTeamId = activeRegistration\?\.teamId \?\? null;/,
  '\n    const leaderTeamId = activeRegistration?.teamId ?? null;'
);

// (b) Insert top-level declaration after isUpdate.
if (!/const activeRegistration = isUpdate \? existing : null/.test(s)) {
  s = s.replace(
    /(const isUpdate =\s*\n\s*existing &&\s*\n\s*existing\.status !== \"WITHDRAWN\" &&\s*\n\s*existing\.status !== \"REJECTED\";)/,
    '\$1\n  const activeRegistration = isUpdate ? existing : null;'
  );
}

if (s === before) {
  console.error('  Anchors did not match.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'const activeRegistration\|const isUpdate\|const leaderTeamId' "$FILE" | head -10

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
git commit -m "Hoist activeRegistration to top-level scope (was block-scoped to team mode); solo form references now in scope too"
git push

echo ""
echo "Done."
