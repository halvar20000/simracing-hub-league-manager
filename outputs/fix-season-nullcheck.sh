#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/lib/standings.ts'

# Allow season to be possibly null at this access site.
sed -i.bak \
  's|season.scoringSystem.dropWorstNRounds|season?.scoringSystem.dropWorstNRounds|' \
  "$PAGE"
rm -f "$PAGE.bak"

grep -n 'season?.scoringSystem.dropWorstNRounds\|season\.scoringSystem\.dropWorstNRounds' "$PAGE"

echo ""
git add -A
git commit -m "standings: optional-chain season for dropWorstNRounds"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
