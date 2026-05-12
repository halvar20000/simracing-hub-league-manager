#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== IEC Season 3: car classes + cars + how many TeamResults each ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const s = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
    include: {
      carClasses: {
        include: {
          cars: { select: { id: true, name: true, iracingCarId: true } },
          _count: { select: { teamResults: true, registrations: true } },
        },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });
  if (!s) { console.log('(season not found)'); return; }
  console.log('Season:', s.name, '— ' + s.carClasses.length + ' car classes');
  for (const c of s.carClasses) {
    console.log('  ' + c.shortCode.padEnd(8) + ' / ' + c.name + ' (iracingCarClassId=' + (c.iracingCarClassId ?? '-') + ', teamResults=' + c._count.teamResults + ', regs=' + c._count.registrations + ')');
    for (const car of c.cars) {
      console.log('    └─ ' + (car.name ?? '?').padEnd(40) + ' (iracingCarId=' + (car.iracingCarId ?? '-') + ')');
    }
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Distinct iRacing car_class_ids seen in IEC JSON files ==="
node -e "
const fs = require('fs');
const seen = new Map();
for (const f of fs.readdirSync('CAS_Leagues/IEC').filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('CAS_Leagues/IEC/' + f, 'utf8'));
  for (const s of j.data.session_results || []) {
    if (s.simsession_type !== 6) continue;
    for (const r of s.results || []) {
      if (typeof r.car_class_id !== 'number') continue;
      const k = r.car_class_id + ' / ' + (r.car_class_short_name || '?');
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
}
console.log('iRacing classes appearing across IEC JSON race rows:');
for (const [k, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + k.padEnd(40) + ' x' + n);
}
"

echo ""
echo "=== /leagues/[slug]/seasons/[seasonId]/page.tsx — what's currently rendered ==="
sed -n '1,80p' 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx'
