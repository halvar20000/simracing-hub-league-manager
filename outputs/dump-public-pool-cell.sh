#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

F='src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'

echo "=== rounds.map cell rendering in PUBLIC penalty-pool page ==="
LN=$(grep -nE 'rounds\.map\(\(r\)' "$F" | head -1 | cut -d: -f1 || true)
if [ -n "${LN:-}" ]; then
  START=$((LN - 2)); [ $START -lt 1 ] && START=1
  END=$((LN + 35))
  sed -n "${START},${END}p" "$F"
fi

echo ""
echo "=== DriverRow type + row creation block ==="
grep -nE 'type DriverRow|rowMap\.set|registrationId' "$F" | head -20
