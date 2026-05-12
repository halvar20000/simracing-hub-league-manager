#!/usr/bin/env bash
# Dump structure of the public round page and the standings page so
# we can write precise patches for class-toggle + Grid/Quali columns.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PUB_ROUND='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
STANDINGS='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

echo "=== Public round page: line count + top imports ==="
if [ -f "$PUB_ROUND" ]; then
  wc -l "$PUB_ROUND"
  sed -n '1,30p' "$PUB_ROUND"
  echo ""
  echo "Lines mentioning key tokens:"
  grep -n -E 'finishPosition|bestLapTimeMs|<table|<thead|<tbody|<tr|carClass|raceResults|isMulticlass|formatMsToTime' "$PUB_ROUND" | head -60
else
  echo "MISSING: $PUB_ROUND"
fi

echo ""
echo "=== Standings page: line count + top imports ==="
if [ -f "$STANDINGS" ]; then
  wc -l "$STANDINGS"
  sed -n '1,40p' "$STANDINGS"
  echo ""
  echo "Lines mentioning key tokens (toggle, view, class):"
  grep -n -E 'view\b|searchParams|toggle|tab|combined|class\b|proAmClass|computeDriverStandings|<table|<thead|<tbody' "$STANDINGS" | head -80
else
  echo "MISSING: $STANDINGS"
fi
