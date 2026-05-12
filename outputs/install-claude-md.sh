#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/4f20476b-d7c7-41be-92dd-80316cf39863/0df53c3c-efef-4a90-a396-23f26e09cdf9/local_b222b9b9-ee6f-4bd4-b847-c691375bf876/outputs/CLAUDE-league-manager.md"

if [ ! -f "$SRC" ]; then
  echo "!!! Source CLAUDE.md not found at:"
  echo "    $SRC"
  exit 1
fi

echo "=== 1. Copy to repo root as CLAUDE.md ==="
if [ -f CLAUDE.md ]; then
  echo "  Backing up existing CLAUDE.md → CLAUDE.md.bak"
  cp CLAUDE.md CLAUDE.md.bak
fi
cp "$SRC" CLAUDE.md
echo "  Wrote $(pwd)/CLAUDE.md  ($(wc -l < CLAUDE.md) lines)"

echo ""
echo "=== 2. Sanity check — first 20 lines ==="
head -20 CLAUDE.md

echo ""
echo "=== 3. Commit + push ==="
git add CLAUDE.md
git status --short
git commit -m "Add repo-level CLAUDE.md briefing for future Claude conversations"
git push

echo ""
echo "Done. Any new Claude conversation that opens this folder will read CLAUDE.md automatically."
