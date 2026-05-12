#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'
echo "=== Lines 130-260 (continuation of render) ==="
sed -n '130,260p' "$PAGE"
echo ""
echo "=== Lines 260-380 ==="
sed -n '260,380p' "$PAGE"
