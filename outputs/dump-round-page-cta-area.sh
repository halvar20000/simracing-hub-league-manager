#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
sed -n '290,325p' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
