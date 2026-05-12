#!/usr/bin/env bash
# Bump all league + CAS Community logos from 20px to 36px (h-9 in Tailwind).

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# h-5 w-5      → h-9 w-9     (square logos: CAS hero, corner logos)
# h-5 w-full   → h-9 w-full  (grid card logos)
sed -i '' \
  -e 's|h-5 w-5|h-9 w-9|g' \
  -e 's|h-5 w-full|h-9 w-full|g' \
  src/app/page.tsx \
  src/app/leagues/page.tsx \
  'src/app/leagues/[slug]/page.tsx' \
  'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "Done. All logos bumped to 36px (h-9)."
echo "Refresh the browser tab — Tailwind hot-reloads automatically."
