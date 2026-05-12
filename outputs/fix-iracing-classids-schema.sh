#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Current CarClass model in schema ==="
awk '/^model CarClass/,/^}/' prisma/schema.prisma

echo ""
mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// Walk the CarClass model only and check + insert.
const lines = s.split("\n");
let inModel = false, close = -1, hasField = false;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+CarClass\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel) {
    if (/^}\s*$/.test(lines[i])) { close = i; break; }
    if (/iracingCarClassIds\s+Int\[\]/.test(lines[i])) hasField = true;
  }
}
if (close === -1) { console.error("CarClass closing brace not found."); process.exit(1); }
if (hasField) {
  console.log("Schema: iracingCarClassIds already in CarClass model.");
} else {
  lines.splice(close, 0, "  iracingCarClassIds Int[]     @default([])");
  fs.writeFileSync(FILE, lines.join("\n"));
  console.log("Schema: inserted iracingCarClassIds into CarClass at line " + (close + 1));
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== CarClass model after patch ==="
awk '/^model CarClass/,/^}/' prisma/schema.prisma

echo ""
echo "=== prisma db push (no skip) ==="
npx --yes prisma db push

echo ""
echo "=== Wipe + regenerate client ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

echo ""
echo "=== Verify iracingCarClassIds in generated index.d.ts ==="
if grep -q "iracingCarClassIds" node_modules/.prisma/client/index.d.ts; then
  echo "[OK] iracingCarClassIds present."
else
  echo "[FAIL] iracingCarClassIds STILL not present."
  exit 1
fi

echo ""
echo "=== Now finish the GT3 rename ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
  });
  if (!season) { console.log('CC IEC Season 3 not found.'); return; }
  const survivor = await p.carClass.findFirst({
    where: { seasonId: season.id, iracingCarClassId: 4091 },
  });
  if (!survivor) { console.log('Surviving GT3 class not found.'); return; }
  await p.carClass.update({
    where: { id: survivor.id },
    data: {
      name: 'GT3',
      shortCode: 'GT3',
      displayOrder: 2,
      iracingCarClassIds: [4091, 2708],
    },
  });
  console.log('Renamed to GT3.');

  const final = await p.carClass.findMany({
    where: { seasonId: season.id },
    include: { _count: { select: { cars: true, teamResults: true } } },
    orderBy: { displayOrder: 'asc' },
  });
  for (const c of final) {
    console.log('  ' + c.shortCode.padEnd(6) + ' / ' + c.name.padEnd(8) +
      '  iracingIds=' + JSON.stringify([c.iracingCarClassId, ...(c.iracingCarClassIds ?? [])].filter(x => x != null)) +
      '  cars=' + c._count.cars +
      '  teamResults=' + c._count.teamResults);
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
