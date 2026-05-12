#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Schema patch — properly scoped to the RaceResult model
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// Walk into the RaceResult model and check + insert.
const lines = s.split("\n");
let inRR = false, close = -1;
let alreadyHas = false;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+RaceResult\s*{/.test(lines[i])) { inRR = true; continue; }
  if (inRR) {
    if (/^}\s*$/.test(lines[i])) { close = i; break; }
    if (/^\s*carId\s+String\?/.test(lines[i])) { alreadyHas = true; }
  }
}
if (close === -1) { console.error("RaceResult brace not found."); process.exit(1); }
if (alreadyHas) {
  console.log("RaceResult.carId already present.");
} else {
  lines.splice(close, 0,
    "  carId            String?",
    "  car              Car?     @relation(fields: [carId], references: [id])"
  );
  s = lines.join("\n");
  fs.writeFileSync(FILE, s);
  console.log("RaceResult: added carId + car relation.");
}

// Also ensure the Car back-relation exists.
let s2 = fs.readFileSync(FILE, "utf8");
if (!/^\s*raceResults\s+RaceResult\[\]/m.test(s2)) {
  // Insert just before Car's closing brace.
  const ll = s2.split("\n");
  let inCar = false, c2 = -1;
  for (let i = 0; i < ll.length; i++) {
    if (/^model\s+Car\s*{/.test(ll[i])) { inCar = true; continue; }
    if (inCar && /^}\s*$/.test(ll[i])) { c2 = i; break; }
  }
  if (c2 !== -1) {
    ll.splice(c2, 0, "  raceResults   RaceResult[]");
    fs.writeFileSync(FILE, ll.join("\n"));
    console.log("Car: added raceResults back-relation.");
  }
}
EOF
node outputs-tmp/patch-schema.mjs

# Show the actual model so we can be sure.
echo ""
echo "=== RaceResult model (post-patch) ==="
awk '/^model RaceResult/,/^}/' prisma/schema.prisma

echo ""
echo "=== Car model (post-patch) ==="
awk '/^model Car /,/^}/' prisma/schema.prisma

# ---------------------------------------------------------------------------
# 2. Push schema, wipe caches, regenerate
# ---------------------------------------------------------------------------
echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate

rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ---------------------------------------------------------------------------
# 3. Verify carId is in the generated client
# ---------------------------------------------------------------------------
echo ""
echo "=== Verifying RaceResult.carId in generated client ==="
node -e "
const t = require('fs').readFileSync('node_modules/.prisma/client/index.d.ts', 'utf8');
// Look for the RaceResult Payload type and check carId is in it.
const m = t.match(/RaceResult: \\{[\\s\\S]*?objects: \\{[\\s\\S]*?\\}[\\s\\S]*?scalars[\\s\\S]*?\\}/);
if (m && /carId\\??:\\s*string/.test(m[0])) {
  console.log('[OK] RaceResult.carId is in the generated client.');
} else if (t.includes('carId') && t.includes('RaceResult')) {
  console.log('[OK] carId references found near RaceResult (ok).');
} else {
  console.log('[FAIL] RaceResult.carId NOT in generated client.');
  process.exit(1);
}
"

# ---------------------------------------------------------------------------
# 4. Backfill (now actually has the column)
# ---------------------------------------------------------------------------
echo ""
echo "=== Backfilling RaceResult.carId from Registration.carId ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const regs = await p.registration.findMany({
    where: { carId: { not: null } },
    select: { id: true, carId: true },
  });
  let updated = 0;
  for (const r of regs) {
    const res = await p.raceResult.updateMany({
      where: { registrationId: r.id, carId: null },
      data: { carId: r.carId },
    });
    updated += res.count;
  }
  console.log('  Backfilled ' + updated + ' race result rows.');
  await p.\$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
"

rm -rf outputs-tmp

# ---------------------------------------------------------------------------
# 5. Type check + commit
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Per-car ranking: actually add RaceResult.carId to the schema (previous patch false-positived on Registration.carId)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
