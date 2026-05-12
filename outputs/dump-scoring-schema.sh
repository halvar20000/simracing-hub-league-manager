#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== ScoringSystem model in prisma/schema.prisma ==="
awk '/^model ScoringSystem/,/^}/' prisma/schema.prisma
