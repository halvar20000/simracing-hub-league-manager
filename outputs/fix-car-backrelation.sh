#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let lines = fs.readFileSync(FILE, "utf8").split("\n");

// Find "model Car {" line specifically (NOT model CarClass or anything else).
let modelStart = -1;
for (let i = 0; i < lines.length; i++) {
  // Use word boundary: model + whitespace + Car + (whitespace OR { ).
  // Reject CarClass etc. by requiring "Car" to be followed by whitespace before {.
  if (/^model\s+Car(\s|$)/.test(lines[i]) && !/^model\s+CarClass\b/.test(lines[i])) {
    modelStart = i;
    break;
  }
}
if (modelStart === -1) {
  console.error("Could not locate 'model Car {' line.");
  process.exit(1);
}
console.log(`Found 'model Car {' at line ${modelStart + 1}: "${lines[modelStart]}"`);

// Walk to the closing } of this model.
let modelEnd = -1;
for (let i = modelStart + 1; i < lines.length; i++) {
  if (/^}\s*$/.test(lines[i])) { modelEnd = i; break; }
}
if (modelEnd === -1) {
  console.error("Could not locate Car model's closing brace.");
  process.exit(1);
}

// Check whether raceResults already inside.
const inside = lines.slice(modelStart, modelEnd + 1).join("\n");
if (/raceResults\s+RaceResult\[\]/.test(inside)) {
  console.log("Car.raceResults already present.");
  process.exit(0);
}

lines.splice(modelEnd, 0, "  raceResults   RaceResult[]");
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`Inserted 'raceResults RaceResult[]' before Car's closing brace at line ${modelEnd + 1}.`);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Car model (post-patch) ==="
awk '/^model Car /,/^}/' prisma/schema.prisma

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate

rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# Backfill (now that the column exists)
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

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Per-car ranking: add Car.raceResults back-relation so the schema is valid"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
