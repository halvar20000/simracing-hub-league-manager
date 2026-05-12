#!/usr/bin/env bash
# Shrink the league logo display sizes:
#   - Home page + /leagues card containers: h-40 → h-28 (160px → 112px)
#   - League detail page header logo: h-32/h-40 → h-20/h-24 (smaller)
# CAS Community hero logo on home stays the same (it's the focal point).

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# Card containers on home + /leagues
sed -i '' \
  's|flex h-40 items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6|flex h-28 items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-4|g' \
  src/app/page.tsx \
  src/app/leagues/page.tsx

# League detail header logo
sed -i '' \
  's|h-32 w-32 object-contain sm:h-40 sm:w-40|h-20 w-20 object-contain sm:h-24 sm:w-24|g' \
  'src/app/leagues/[slug]/page.tsx'

echo "Done. League logos resized."
echo "Refresh the browser tab to see the change (no dev server restart needed)."
