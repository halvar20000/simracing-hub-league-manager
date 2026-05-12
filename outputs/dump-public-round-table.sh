#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
echo "=== Public round page lines 90-180 (table block) ==="
sed -n '90,180p' "$PAGE"
