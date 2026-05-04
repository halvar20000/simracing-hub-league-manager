#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Public roster: hide Fee column when league has no fee configured
# ============================================================================
echo "=== 1. Patch public roster ==="
cat > /tmp/lm_public_fee.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Compute showFee just after the season fetch / notFound check.
//     Anchor on the existing const declaration that follows the fetch.
if (!s.includes('const showFee')) {
  s = s.replace(
    /(const showClass = season\.isMulticlass;)/,
    `$1
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;`
  );
}

// (b) Wrap the Fee <th> in {showFee && ...}
s = s.replace(
  /<th className="px-4 py-3">Fee<\/th>/,
  '{showFee && (\n                  <th className="px-4 py-3">Fee</th>\n                )}'
);

// (c) Wrap the Fee <td> in {showFee && ...}
//     Cell pattern: <td><FlagBadge value={r.startingFeePaid} labels={{...}} /></td>
s = s.replace(
  /(<td className="px-4 py-3">\s*\n\s*<FlagBadge\s*\n\s*value=\{r\.startingFeePaid\}\s*\n\s*labels=\{\{ YES: "Paid", NO: "Not paid" \}\}\s*\n\s*\/>\s*\n\s*<\/td>)/,
  '{showFee && (\n                  $1\n                  )}'
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_public_fee.js

echo "-- Verify --"
grep -n 'showFee\|>Fee<' 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' | head -10

# ============================================================================
# 2. Admin roster: same conditional hide
# ============================================================================
echo ""
echo "=== 2. Patch admin roster ==="
cat > /tmp/lm_admin_fee.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Need league.registrationFee on the season query. Currently the season
//     is fetched with `include: { league: true }` (top of the page) — that
//     already returns the field. Compute showFee right after.
if (!s.includes('const showFee')) {
  // Anchor on the existing pendingCount or registrations declaration. The
  // simplest stable anchor is the closing of the season fetch block — but
  // structures vary. Insert just before the return ( using a generic anchor.
  s = s.replace(
    /(const pendingCount = registrations\.filter\(\s*\n\s*\(r\) => r\.status === "PENDING"\s*\n\s*\)\.length;)/,
    `$1
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;`
  );
}

// (b) Wrap the Fee <th> — admin uses px-4 py-3 too
s = s.replace(
  /<th className="px-4 py-3">Fee<\/th>/,
  '{showFee && (\n              <th className="px-4 py-3">Fee</th>\n              )}'
);

// (c) Wrap the Fee <td> with FlagSelect inside.
//     Pattern: <td><RegistrationFlagSelect ... field="startingFeePaid" ... /></td>
s = s.replace(
  /(<td className="px-4 py-3">\s*\n\s*<RegistrationFlagSelect\s*\n\s*registrationId=\{r\.id\}\s*\n\s*field="startingFeePaid"\s*\n\s*value=\{r\.startingFeePaid\}\s*\n\s*\/>\s*\n\s*<\/td>)/,
  '{showFee && (\n                $1\n                )}'
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_admin_fee.js

echo "-- Verify --"
grep -n 'showFee\|>Fee<' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' | head -10

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Roster: hide Fee column on public and admin views when the league has no registration fee"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Result: SFL Cup and Combined Cup rosters no longer show a Fee column."
echo "GT3 WCT, GT4 TSS, and PCCD still show it (their leagues have a fee set)."
