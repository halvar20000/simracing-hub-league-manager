#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== src/components/nav.tsx ==="
cat src/components/nav.tsx
echo ""
echo "=== Files in public/logos/ ==="
ls -la public/logos/
