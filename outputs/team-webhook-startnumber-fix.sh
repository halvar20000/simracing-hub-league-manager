#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Remove startNumber reference from team Discord webhook ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Remove the trailing start-number suffix in the team webhook description.
// Pattern: \` · #\${startNumber}\` : \"\"
s = s.replace(
  /\s*\+\s*\n?\s*\(startNumber !== null && startNumber !== undefined \? \` · #\\\$\{startNumber\}\` : \"\"\)/,
  ''
);
s = s.replace(
  /\s*\+\s*\n?\s*\(startNumber != null \? \` · #\\\$\{startNumber\}\` : \"\"\)/,
  ''
);

if (s === before) {
  console.log('  Already removed — checking line 540 directly.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

echo ""
echo "-- Verify line 540 area --"
sed -n '535,545p' src/lib/actions/registrations.ts

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
git commit -m "Team webhook: remove startNumber suffix (no longer collected in team form)"
git push

echo ""
echo "Done."
