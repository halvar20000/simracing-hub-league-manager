#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== Lines 175-235 of standings.ts (per-round roundPoints construction) ==="
sed -n '175,235p' src/lib/standings.ts
