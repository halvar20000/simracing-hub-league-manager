#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Cars in Combined Cup season ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const cc = await p.league.findFirst({ where: { slug: { contains: 'combined' } } });
  if (!cc) { console.log('(no Combined Cup league found)'); return; }
  const seasons = await p.season.findMany({
    where: { leagueId: cc.id },
    include: {
      cars: { include: { carClass: { select: { name: true, shortCode: true } } } },
      carClasses: true,
      registrations: {
        where: { status: 'APPROVED' },
        include: { car: true, user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { year: 'desc' },
  });
  for (const s of seasons) {
    console.log('');
    console.log('Season:', s.name, '(year ' + s.year + ', isMulticlass=' + s.isMulticlass + ')');
    console.log('  Car classes:');
    for (const c of s.carClasses) console.log('    - ' + c.shortCode + ' / ' + c.name);
    console.log('  Cars (' + s.cars.length + '):');
    for (const c of s.cars) {
      console.log('    - ' + c.name + ' (iracingCarId=' + (c.iracingCarId??'-') + ', class=' + (c.carClass?.shortCode||'?') + ')');
    }
    console.log('  Driver → car (first 15):');
    for (const r of s.registrations.slice(0, 15)) {
      console.log('    - ' + (r.user.firstName||'?') + ' ' + (r.user.lastName||'?') + ' → ' + (r.car?.name || '(no car set)'));
    }
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Public standings page (top 80 lines) ==="
sed -n '1,80p' 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

echo ""
echo "=== Cls type and tab definitions in standings page ==="
grep -n -E "type Cls|cls === \"|cls: \"" 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' | head -40
