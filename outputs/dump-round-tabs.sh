#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

F='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== 1. Lines mentioning 'Combined', tab labels, baseHref ==="
grep -nE 'Combined|>Pro<|>Am<|>By car<|>Teams?<|baseHref|cls=' "$F" | head -40

echo ""
echo "=== 2. Dump 80 lines around the first 'Combined' (the tab nav) ==="
LN=$(grep -nE 'Combined' "$F" | head -1 | cut -d: -f1 || true)
if [ -n "${LN:-}" ]; then
  START=$((LN - 10)); [ $START -lt 1 ] && START=1
  END=$((LN + 100))
  sed -n "${START},${END}p" "$F"
fi
