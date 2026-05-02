#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "=== Patch baseUrl on the Registration link card ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Old:
//   const baseUrl =
//     process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '';
// New: prefer NEXT_PUBLIC_SITE_URL (used in actions for webhook/email);
// fall back to a hardcoded production URL so the copy button always works.
s = s.replace(
  /const baseUrl =\s*\n\s*process\.env\.NEXT_PUBLIC_BASE_URL \|\| process\.env\.NEXTAUTH_URL \|\| \"\";/,
  \`const baseUrl =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXT_PUBLIC_BASE_URL ||
            process.env.NEXTAUTH_URL ||
            \\\"https://league.simracing-hub.com\\\";\`
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
grep -n 'NEXT_PUBLIC_SITE_URL\|league.simracing-hub.com' "$FILE" | head -5

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
git commit -m "Admin: registration link uses NEXT_PUBLIC_SITE_URL with hardcoded fallback so copied URL is absolute"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on any admin season page with the green 'Registration link' card,"
echo "the displayed URL will start with https://league.simracing-hub.com/..."
echo "(or whatever NEXT_PUBLIC_SITE_URL is set to in Vercel)."
