#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# 1. Update R4 (Indianapolis) date to match the actual JSON: 13.12.2025 16:30 UTC
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const r = await p.round.findFirst({
    where: {
      season: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
      roundNumber: 4,
    },
  });
  if (!r) { console.log('R4 not found.'); return; }
  await p.round.update({
    where: { id: r.id },
    data: { startsAt: new Date('2025-12-13T16:30:00Z') },
  });
  console.log('R4 startsAt updated to 2025-12-13T16:30:00Z');
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Now re-running the IEC replay (idempotent — wipes + re-imports) ==="
bash "$HOME/Library/Application Support/Claude/local-agent-mode-sessions/4f20476b-d7c7-41be-92dd-80316cf39863/0df53c3c-efef-4a90-a396-23f26e09cdf9/local_b222b9b9-ee6f-4bd4-b847-c691375bf876/outputs/iec-season3-replay.sh"
