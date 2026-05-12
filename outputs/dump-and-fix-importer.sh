#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/lib/actions/irlm-import.ts'

echo "=== Dump current irlm-import.ts ==="
cat "$PAGE"
