#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/app/admin/page.tsx ==="
cat src/app/admin/page.tsx

echo ""
echo "=== src/app/admin/layout.tsx ==="
cat src/app/admin/layout.tsx

echo ""
echo "=== Existing structure under src/app/admin (top level) ==="
ls -la src/app/admin
