#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== src/components/footer.tsx ==="
cat src/components/footer.tsx 2>/dev/null || ls src/components/
