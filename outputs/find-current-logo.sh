#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Image files in public/ ==="
find public -maxdepth 3 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.svg' -o -iname '*.webp' -o -iname '*.ico' \) 2>/dev/null | sort

echo ""
echo "=== 2. Anything mentioning SimRacing / simracing / SRH / sim-racing ==="
grep -rn -iE 'simracing|sim-racing|simracing[-_ ]?hub|"SRH"' src/ 2>/dev/null | head -40 || echo "  (none)"

echo ""
echo "=== 3. <Image>/<img> in nav.tsx and layout.tsx ==="
for f in src/components/nav.tsx src/app/layout.tsx; do
  [ -f "$f" ] || continue
  echo "-- $f --"
  grep -nE '<Image|<img|\.png|\.jpg|\.jpeg|\.svg|\.webp' "$f" | head -10
done

echo ""
echo "=== 4. Anywhere else in src/ that imports/uses an image asset ==="
grep -rn -E 'from\s+["'\''"]/(.*\.(png|jpg|jpeg|svg|webp))["'\''"]|src=["'\''"]/(.*\.(png|jpg|jpeg|svg|webp))["'\''"]|src=\{["'\''"]/(.*\.(png|jpg|jpeg|svg|webp))["'\''"]' src/ 2>/dev/null | head -20

echo ""
echo "Done. Tell me which file IS the SimRacing-Hub logo and I'll give you the next step."
