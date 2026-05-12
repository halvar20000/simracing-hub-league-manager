#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== Latest commit ==="
git log -3 --oneline

echo ""
echo "=== Lines around 'rank: i + 1' (podium block) ==="
LINE=$(grep -n 'rank: i + 1' "$PAGE" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE - 4))
  END=$((LINE + 18))
  sed -n "${START},${END}p" "$PAGE"
fi

echo ""
echo "=== git status ==="
git status --short
