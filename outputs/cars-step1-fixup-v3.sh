#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Show what's already in the Car table ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cars = await p.car.findMany({
    include: { carClass: { select: { name: true } }, season: { select: { name: true, year: true, league: { select: { slug: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log('  Total existing cars: ' + cars.length);
  for (const c of cars) {
    console.log('    [' + c.season.league.slug + ' / ' + c.season.name + ' ' + c.season.year + ' / ' + c.carClass.name + '] ' + c.name + ' (id=' + c.id + ', iR=' + (c.iracingCarId ?? '-') + ')');
  }
  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"

# ---------------------------------------------------------------------------
# 2. Make updatedAt default to now() so the existing 17 rows can be migrated
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Add @default(now()) to Car.updatedAt ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /(\bmodel Car \{[\s\S]*?)updatedAt\s+DateTime\s+@updatedAt/,
  '\$1updatedAt     DateTime @default(now()) @updatedAt'
);
if (s === before) {
  console.error('  Could not find updatedAt in Car model.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

echo ""
echo "-- Resulting Car model --"
awk '/^model Car \{/,/^\}/' prisma/schema.prisma

# ---------------------------------------------------------------------------
# 3. Push + regenerate
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ---------------------------------------------------------------------------
# 4. TS check
# ---------------------------------------------------------------------------
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 5. Commit + push
# ---------------------------------------------------------------------------
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Cars: Car.updatedAt default(now()) so existing rows migrate cleanly"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Existing 17 cars are preserved."
echo "Visit  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<id>/cars"
echo "to see them and add the GT4 TSS / GT3 WCT lists where missing."
