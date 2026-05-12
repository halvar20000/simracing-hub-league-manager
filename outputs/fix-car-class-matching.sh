#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Importer: smart car-class matching by name keywords
# ===========================================================================
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("guessCarClassId")) {
  console.log("Importer: smart matcher already in place.");
  process.exit(0);
}

// Replace the resolveCarId function entirely.
const before = `// CAR LOOKUP — resolve a season's Car for an iRacing car_id.
// Auto-creates Car (and a default CarClass if the season has none).
async function resolveCarId(
  seasonId: string,
  iracingCarId: number,
  carName: string,
  carClassShortName: string | null
): Promise<string | null> {
  if (!iracingCarId || !Number.isFinite(iracingCarId)) return null;

  const existing = await prisma.car.findFirst({
    where: { seasonId, iracingCarId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Need a CarClass for the new Car. Use season's first, or auto-create.
  let carClass = await prisma.carClass.findFirst({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  if (!carClass) {
    const shortCode = (carClassShortName ?? "ALL").slice(0, 8).toUpperCase();
    carClass = await prisma.carClass.create({
      data: {
        seasonId,
        name: carClassShortName ?? "All Cars",
        shortCode,
      },
    });
  }

  const created = await prisma.car.create({
    data: {
      seasonId,
      carClassId: carClass.id,
      name: carName || \`iRacing #\${iracingCarId}\`,
      iracingCarId,
    },
  });
  return created.id;
}`;

const after = `// CAR LOOKUP — resolve a season's Car for an iRacing car_id.
// Auto-creates Car (and a default CarClass if the season has none).
// Tries to guess the right CarClass by matching keywords in the car's name
// against each CarClass's name (e.g. "Radical SR8" → CarClass "Radical SR 8").
function guessCarClassId(
  carName: string,
  classes: { id: string; name: string; displayOrder: number }[]
): string {
  const haystack = carName.toLowerCase();
  for (const c of classes) {
    const tokens = c.name.toLowerCase().split(/\\W+/).filter((t) => t.length > 2);
    if (tokens.some((t) => haystack.includes(t))) return c.id;
  }
  // Fallback: first class by displayOrder.
  return classes[0].id;
}

async function resolveCarId(
  seasonId: string,
  iracingCarId: number,
  carName: string,
  carClassShortName: string | null
): Promise<string | null> {
  if (!iracingCarId || !Number.isFinite(iracingCarId)) return null;

  const existing = await prisma.car.findFirst({
    where: { seasonId, iracingCarId },
    select: { id: true },
  });
  if (existing) return existing.id;

  let classes = await prisma.carClass.findMany({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, displayOrder: true },
  });

  // No classes at all → auto-create one from the iRacing class name.
  if (classes.length === 0) {
    const shortCode = (carClassShortName ?? "ALL").slice(0, 8).toUpperCase();
    const created = await prisma.carClass.create({
      data: {
        seasonId,
        name: carClassShortName ?? "All Cars",
        shortCode,
      },
    });
    classes = [{ id: created.id, name: created.name, displayOrder: created.displayOrder }];
  }

  const carClassId = guessCarClassId(carName || "", classes);

  const created = await prisma.car.create({
    data: {
      seasonId,
      carClassId,
      name: carName || \`iRacing #\${iracingCarId}\`,
      iracingCarId,
    },
  });
  return created.id;
}`;

if (!s.includes(before)) { console.error("Importer: resolveCarId anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Importer: smart car-class matcher wired.");
EOF
node outputs-tmp/patch-importer.mjs

# ===========================================================================
# 2. Standings page: gate Pro/Am tabs on proAmEnabled (not isMulticlass)
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = `          {season.isMulticlass && (<>
            <Link href={\`\${baseHref}?cls=pro\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>
            <Link href={\`\${baseHref}?cls=am\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>
          </>)}`;
const after = `          {season.proAmEnabled && (<>
            <Link href={\`\${baseHref}?cls=pro\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>
            <Link href={\`\${baseHref}?cls=am\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>
          </>)}`;

if (s.includes("season.proAmEnabled && (<>")) {
  console.log("Standings page: Pro/Am tabs already gated on proAmEnabled.");
} else if (!s.includes(before)) {
  console.error("Standings page: Pro/Am block anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Standings page: Pro/Am tabs now gated on proAmEnabled.");
}
EOF
node outputs-tmp/patch-standings.mjs

rm -rf outputs-tmp

# ===========================================================================
# 3. Reassign the 3 existing CC cars to the right classes
# ===========================================================================
echo ""
echo "=== Reassigning existing CC cars to correct classes ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function guess(carName, classes) {
  const h = (carName || '').toLowerCase();
  for (const c of classes) {
    const tokens = c.name.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    if (tokens.some(t => h.includes(t))) return c;
  }
  return classes[0];
}

async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!season) { console.log('  (no season)'); return; }

  const classes = await p.carClass.findMany({
    where: { seasonId: season.id },
    orderBy: { displayOrder: 'asc' },
  });
  const cars = await p.car.findMany({ where: { seasonId: season.id } });

  for (const car of cars) {
    const target = guess(car.name, classes);
    if (target.id === car.carClassId) {
      console.log('  ' + car.name + ' — already in ' + classes.find(c => c.id === car.carClassId)?.name);
      continue;
    }
    await p.car.update({ where: { id: car.id }, data: { carClassId: target.id } });
    console.log('  ' + car.name + ' → moved to ' + target.name);
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Multiclass: smart car→class matching on JSON import + gate Pro/Am tabs on proAmEnabled (not isMulticlass)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
