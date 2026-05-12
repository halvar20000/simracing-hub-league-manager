#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/lib/standings.ts'
echo "=== Lines 200-260 (the constructor area) ==="
sed -n '200,260p' "$PAGE"
