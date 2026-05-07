#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/scoring-systems/[id]/edit/page.tsx'

# ============================================================================
# 1. Find the relevant lines first
# ============================================================================
echo "=== Look at the checkbox + description area (lines around 240-310) ==="
sed -n '240,310p' "$FILE"

# ============================================================================
# 2. Patch — make the checkbox label + helper text conditional on teamMode
# ============================================================================
echo ""
echo "=== Patch checkbox label + helper text ==="
node -e "
const fs = require('fs');
const FILE = '$FILE';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Checkbox label: 'Enable driver FPR' → conditional
s = s.replace(
  /Enable driver FPR/g,
  '{teamMode ? \"Enable team FPR\" : \"Enable driver FPR\"}'
);

// (b) Description: 'Awards FPR points to each driver per round'
s = s.replace(
  /Awards FPR points to each driver per round/g,
  '{teamMode ? \"Awards FPR points to each team per round\" : \"Awards FPR points to each driver per round\"}'
);

// (c) Min distance label: 'Driver minimum distance %' or similar
s = s.replace(
  /Driver minimum distance %/g,
  '{teamMode ? \"Team minimum distance %\" : \"Driver minimum distance %\"}'
);

// (d) Tier table header / description
s = s.replace(
  /Driver FPR tiers/g,
  '{teamMode ? \"Team FPR tiers\" : \"Driver FPR tiers\"}'
);

if (s === before) {
  console.error('  No replacements made — paste the relevant lines so I can target precisely.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'teamMode ?\|Enable driver\|Enable team\|Awards FPR' "$FILE" | head -10

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
git commit -m "Scoring system edit form: switch driver→team in checkbox label + helper text when teamMode"
git push

echo ""
echo "Done."
