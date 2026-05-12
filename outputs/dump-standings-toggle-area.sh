#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'
echo "=== Lines 80-130 of the standings page (format toggle area) ==="
sed -n '80,130p' "$PAGE"
echo ""
echo "=== After Phase C scaffolding step 1+2 — does the file still have"
echo "    'view: ViewMode = ...' or has it been replaced? ==="
grep -n 'type Cls\|cls: Cls\|Audience:' "$PAGE" | head
