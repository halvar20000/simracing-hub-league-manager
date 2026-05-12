#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx ==="
cat 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx'

echo ""
echo "=== Top 60 lines of the round detail page ==="
sed -n '1,60p' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo ""
echo "=== Line numbers + nearby snippets where headings/CTAs live in round page ==="
grep -n -E "(Round [0-9]+|className=\"[^\"]*flex.*items-center.*justify-between|button|Link href=|CopyLink|Share)" 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' | head -40

echo ""
echo "=== Round page total lines ==="
wc -l 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
