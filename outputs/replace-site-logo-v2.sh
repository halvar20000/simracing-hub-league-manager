#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# Auto-locate the new logo: newest png/jpg/jpeg/webp in ~/Nextcloud/AI/league-manager/
# (top-level only — won't grab anything from public/, src/, etc.)
# ============================================================================
SRC="$(find "$HOME/Nextcloud/AI/league-manager" -maxdepth 1 -type f \
        \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
        -print0 2>/dev/null \
      | xargs -0 ls -t 2>/dev/null | head -1)"

if [ -z "${SRC:-}" ] || [ ! -f "$SRC" ]; then
  echo "!!! Could not find any image in ~/Nextcloud/AI/league-manager/ (top level)."
  echo "    Listing what is there:"
  ls -la "$HOME/Nextcloud/AI/league-manager" | head -30
  exit 1
fi

echo "=== Using source logo: $SRC ==="
ls -la "$SRC"

# ============================================================================
# 1. Copy as the new site logo + OG card logo
# ============================================================================
echo ""
echo "=== 1. Copy logo into public/logos/ ==="
mkdir -p public/logos
cp "$SRC" public/logos/site-logo.png
cp "$SRC" public/logos/cls-league-scoring.png
echo "  Wrote public/logos/site-logo.png"
echo "  Wrote public/logos/cls-league-scoring.png  (OG card)"

# ============================================================================
# 2. Patch nav.tsx so it points at the new .png instead of the old .svg
# ============================================================================
echo ""
echo "=== 2. Patch nav.tsx (site-logo.svg -> site-logo.png) ==="
node -e "
const fs = require('fs');
const FILE = 'src/components/nav.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(/site-logo\.svg/g, 'site-logo.png');
if (s === before) {
  console.log('  No reference to site-logo.svg in nav.tsx (maybe already updated).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

# ============================================================================
# 3. Remove the old SVG so we don't ship dead assets
# ============================================================================
echo ""
echo "=== 3. Remove old SVG ==="
if [ -f public/logos/site-logo.svg ]; then
  rm public/logos/site-logo.svg
  echo "  Deleted public/logos/site-logo.svg"
else
  echo "  (no old SVG to delete)"
fi

# ============================================================================
# 4. Verify + tsc
# ============================================================================
echo ""
echo "-- Verify --"
ls -la public/logos/
echo ""
grep -n 'site-logo' src/components/nav.tsx || true

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
if git diff --cached --quiet; then
  echo "  Nothing staged — no changes to commit."
  exit 0
fi
git commit -m "Logo: replace remaining SimRacing-Hub-style nav logo with new CAS League Scoring System logo (also refresh OG card)"
git push

echo ""
echo "Done."
