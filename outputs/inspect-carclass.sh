#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== CarClass model in schema ==="
awk '/^model CarClass \{/,/^\}/' prisma/schema.prisma

echo ""
echo "=== Existing CarClasses for the GT4 TSS '4th season 2026' ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const seasons = await p.season.findMany({
    where: { name: '4th season 2026' },
    include: { league: true, carClasses: true, _count: { select: { carClasses: true } } },
  });
  for (const s of seasons) {
    console.log('  Season ' + s.id + ' [' + s.league.slug + ' — ' + s.name + ' ' + s.year + ']  classes=' + s._count.carClasses);
    for (const c of s.carClasses) {
      console.log('    - ' + c.id + '  ' + c.name);
    }
  }
  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"
