#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

ADMIN_SEASON='src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "=== 1. Quick check: was Pro/Am calculator file created? ==="
ls -la 'src/app/admin/leagues/[slug]/seasons/[seasonId]/pro-am/page.tsx'

echo ""
echo "=== 2. Show the current 'Manage cars' link area (so I can verify the anchor) ==="
grep -n -B1 -A6 'Manage cars' "$ADMIN_SEASON" | head -20

echo ""
echo "=== 3. Add Pro/Am link via Node patcher (loaded from a file, no shell quoting) ==="
cat > /tmp/lm_proam_link.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('/pro-am`')) {
  console.log('  Already linked.');
  process.exit(0);
}

const before = s;

// Match the existing Manage cars link, capture it, append a sibling Link after.
// We anchor on the closing </Link> of the Manage cars link.
s = s.replace(
  /(href=\{`\/admin\/leagues\/\$\{slug\}\/seasons\/\$\{seasonId\}\/cars`\}[\s\S]*?Manage cars →[\s\S]*?<\/Link>)/,
  `$1
                <Link
                  href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/pro-am\`}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                >
                  Pro/Am calculator →
                </Link>`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_proam_link.js "$ADMIN_SEASON"

echo ""
echo "-- Verify --"
grep -n 'pro-am\|Pro/Am calculator' "$ADMIN_SEASON" | head -5

echo ""
echo "=== 3b. Fix iracingMemberId type (string, not number) ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/pro-am/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /iracingMemberId:\s*number\s*\|\s*null;/,
  'iracingMemberId: string | null;'
);
if (s === before) {
  console.log('  Already fixed (or not present).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Admin: per-season Pro/Am calculator (best-N avg, FPR tiebreaker, top 30%) + season-page link"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on the GT3 WCT 12th Season admin page click 'Pro/Am calculator →'."
