#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== All lines mentioning countryCode in the round page ==="
grep -n 'countryCode' "$PAGE"

echo ""
echo "=== Lines around the podium .map() callback (search 'rank: i + 1') ==="
LINE=$(grep -n 'rank: i + 1' "$PAGE" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE - 3))
  END=$((LINE + 25))
  sed -n "${START},${END}p" "$PAGE"
fi
