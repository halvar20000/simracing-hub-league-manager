#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# v4 — same as v3 minus the pre-listing query that fails because the Prisma
# client was regenerated against the OLD Car shape and doesn't know about
# createdAt yet. We list AFTER the push instead.

# ---------------------------------------------------------------------------
# 1. Make sure Car.updatedAt has @default(now()) so existing rows can migrate
# ---------------------------------------------------------------------------
echo "=== 1. Ensure @default(now()) on Car.updatedAt ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
if (/updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/.test(s)) {
  console.log('  Already has @default(now()).');
  process.exit(0);
}
s = s.replace(
  /(model Car \{[\s\S]*?)updatedAt\s+DateTime\s+@updatedAt/,
  '\$1updatedAt     DateTime @default(now()) @updatedAt'
);
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

echo ""
echo "-- Car model --"
awk '/^model Car \{/,/^\}/' prisma/schema.prisma

# ---------------------------------------------------------------------------
# 2. Push schema, regen client
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ---------------------------------------------------------------------------
# 3. NOW list existing cars with the regenerated client
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. Existing cars in DB ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cars = await p.car.findMany({
    include: {
      carClass: { select: { name: true } },
      season: { select: { name: true, year: true, league: { select: { slug: true } } } },
    },
    orderBy: [{ seasonId: 'asc' }, { name: 'asc' }],
  });
  console.log('  Total: ' + cars.length);
  for (const c of cars) {
    console.log('    [' + c.season.league.slug + ' / ' + c.season.name + ' ' + c.season.year + ' / ' + c.carClass.name + '] ' + c.name + ' (id=' + c.id + ', iR=' + (c.iracingCarId ?? '-') + ')');
  }
  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"

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
git commit -m "Cars: schema + admin Cars page (Step 1) — Car.updatedAt has now() default for existing rows"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Visit:  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<id>/cars"
echo "Pre-existing cars will already be listed; add the GT4 TSS / GT3 WCT entries"
echo "where their CarClass list is empty."
