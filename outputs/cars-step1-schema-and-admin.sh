#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. SCHEMA: add Car model, CarClass.cars relation, Registration.carId + relation
# ============================================================================
echo "=== 1. Schema ==="
cat > /tmp/lm_patch_schema_cars.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Append Car model if missing
if (!/model Car \{/.test(s)) {
  const CAR_MODEL = `

model Car {
  id            String   @id @default(cuid())
  carClassId    String
  carClass      CarClass @relation(fields: [carClassId], references: [id], onDelete: Cascade)

  name          String
  shortName     String?
  iracingCarId  Int?
  displayOrder  Int      @default(0)

  registrations Registration[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([carClassId, name])
  @@index([carClassId])
}
`;
  s = s.trimEnd() + CAR_MODEL;
}

// (b) Add `cars Car[]` to CarClass
{
  const re = /(model CarClass \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  CarClass model not found'); process.exit(1); }
  if (!/\n\s+cars\s+Car\[\]/.test(m[1])) {
    s = s.replace(re, m[1] + '\n  cars         Car[]' + m[2]);
  }
}

// (c) Add carId + car relation to Registration
{
  const re = /(model Registration \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  Registration model not found'); process.exit(1); }
  if (!/\n\s+carId\s+String\?/.test(m[1])) {
    const inject = '\n  carId        String?\n  car          Car?     @relation(fields: [carId], references: [id], onDelete: SetNull)';
    s = s.replace(re, m[1] + inject + m[2]);
  }
}

if (s === before) {
  console.log('  No schema changes needed (already up to date).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Schema updated: Car model + CarClass.cars + Registration.carId.');
}
JS
node /tmp/lm_patch_schema_cars.js

# ============================================================================
# 2. Push schema and regen client
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. New action file: src/lib/actions/cars.ts
# ============================================================================
echo ""
echo "=== 3. Create src/lib/actions/cars.ts ==="
mkdir -p src/lib/actions
if [ -f src/lib/actions/cars.ts ]; then
  echo "  Already exists — leaving alone."
else
cat > src/lib/actions/cars.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function parseLine(raw: string): { name: string; iracingCarId: number | null } | null {
  const line = raw.trim();
  if (!line) return null;
  const lastComma = line.lastIndexOf(",");
  if (lastComma > -1) {
    const possible = line.slice(lastComma + 1).trim();
    if (/^\d+$/.test(possible)) {
      const name = line.slice(0, lastComma).trim();
      if (!name) return null;
      return { name, iracingCarId: parseInt(possible, 10) };
    }
  }
  return { name: line, iracingCarId: null };
}

export async function addCarsBulk(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");

  const lines = String(formData.get("lines") ?? "").split(/\r?\n/);

  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      _count: { select: { cars: true } },
      season: { include: { league: true } },
    },
  });
  if (!cc) throw new Error("CarClass not found");

  let order = cc._count.cars;
  for (const raw of lines) {
    const parsed = parseLine(raw);
    if (!parsed) continue;
    await prisma.car.upsert({
      where: { carClassId_name: { carClassId, name: parsed.name } },
      update: { iracingCarId: parsed.iracingCarId },
      create: {
        carClassId,
        name: parsed.name,
        iracingCarId: parsed.iracingCarId,
        displayOrder: order,
      },
    });
    order++;
  }

  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}

export async function deleteCar(formData: FormData) {
  await requireAdmin();
  const carId = String(formData.get("carId") ?? "");
  if (!carId) throw new Error("carId required");

  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      carClass: {
        include: { season: { include: { league: true } } },
      },
    },
  });
  if (!car) return;

  await prisma.car.delete({ where: { id: carId } });

  revalidatePath(
    `/admin/leagues/${car.carClass.season.league.slug}/seasons/${car.carClass.seasonId}/cars`
  );
}

export async function updateCarIracingId(formData: FormData) {
  await requireAdmin();
  const carId = String(formData.get("carId") ?? "");
  const raw = String(formData.get("iracingCarId") ?? "").trim();
  if (!carId) throw new Error("carId required");

  const iracingCarId = raw === "" ? null : /^\d+$/.test(raw) ? parseInt(raw, 10) : null;

  const car = await prisma.car.update({
    where: { id: carId },
    data: { iracingCarId },
    include: {
      carClass: {
        include: { season: { include: { league: true } } },
      },
    },
  });

  revalidatePath(
    `/admin/leagues/${car.carClass.season.league.slug}/seasons/${car.carClass.seasonId}/cars`
  );
}
TS
  echo "  Created."
fi

# ============================================================================
# 4. New admin page: /admin/leagues/[slug]/seasons/[seasonId]/cars
# ============================================================================
echo ""
echo "=== 4. Create admin Cars page ==="
mkdir -p 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars'
if [ -f 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx' ]; then
  echo "  Already exists — leaving alone."
else
cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx' <<'TSX'
import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addCarsBulk,
  deleteCar,
  updateCarIracingId,
} from "@/lib/actions/cars";

export default async function AdminSeasonCars({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      carClasses: {
        orderBy: { displayOrder: "asc" },
        include: {
          cars: { orderBy: { displayOrder: "asc" } },
          _count: { select: { cars: true } },
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">
          Cars — {season.name} {season.year}
        </h1>
        <p className="text-sm text-zinc-400">
          Manage the list of cars drivers can pick when registering. Cars are
          grouped by car class. Format: one car per line, optional iRacing ID
          after a comma.
        </p>
      </div>

      {season.carClasses.length === 0 && (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-zinc-400">
          This season has no car classes yet. Add at least one car class on the
          season page before managing cars.
        </p>
      )}

      {season.carClasses.map((cc) => (
        <section
          key={cc.id}
          className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {cc.name}{" "}
              <span className="text-sm text-zinc-500">
                ({cc._count.cars} car{cc._count.cars === 1 ? "" : "s"})
              </span>
            </h2>
          </div>

          {cc.cars.length > 0 ? (
            <ul className="space-y-2">
              {cc.cars.map((car) => (
                <li
                  key={car.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-2"
                >
                  <span className="flex-1">{car.name}</span>
                  <form
                    action={updateCarIracingId}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="carId" value={car.id} />
                    <label className="text-xs text-zinc-500">iR id</label>
                    <input
                      type="text"
                      name="iracingCarId"
                      defaultValue={car.iracingCarId ?? ""}
                      placeholder="—"
                      className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                    >
                      Save
                    </button>
                  </form>
                  <form action={deleteCar}>
                    <input type="hidden" name="carId" value={car.id} />
                    <button
                      type="submit"
                      className="rounded border border-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No cars yet for this class.</p>
          )}

          <form action={addCarsBulk} className="space-y-2">
            <input type="hidden" name="carClassId" value={cc.id} />
            <label className="block text-sm text-zinc-300">
              Add cars (one per line, optional iRacing ID after a comma)
            </label>
            <textarea
              name="lines"
              rows={5}
              placeholder={"Ferrari 296 GT3, 132\nPorsche 911 GT3 R (992), 173\nBMW M4 EVO GT3"}
              className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
            >
              Add to {cc.name}
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 5. Patch admin season page: add "Manage cars" link
# ============================================================================
echo ""
echo "=== 5. Add 'Manage cars' link to admin season page ==="
cat > /tmp/lm_patch_season_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('/cars" className="rounded border')) {
  console.log('  Already linked.');
  process.exit(0);
}

// Insert link row right after the H1 with season.name
const re = /(<h1 className="text-2xl font-bold">\{season\.name\}<\/h1>)/;
if (!re.test(s)) {
  console.error('  H1 anchor not found.');
  process.exit(1);
}

const LINK_ROW = `$1
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/cars\`}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                >
                  Manage cars →
                </Link>
              </div>`;

s = s.replace(re, LINK_ROW);
fs.writeFileSync(FILE, s);
console.log('  Inserted Manage cars link.');
JS
node /tmp/lm_patch_season_page.js

# ============================================================================
# 6. Verify
# ============================================================================
echo ""
echo "=== 6. Verify ==="
echo "-- schema --"
grep -n 'model Car {\|cars         Car\[\]\|carId        String?' prisma/schema.prisma | head -10
echo ""
echo "-- actions --"
grep -n 'export async function addCarsBulk\|deleteCar\|updateCarIracingId' src/lib/actions/cars.ts | head -10
echo ""
echo "-- admin cars page exists --"
ls -la 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx'
echo ""
echo "-- season page has link --"
grep -n 'Manage cars' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' | head -5

# ============================================================================
# 7. TypeScript check
# ============================================================================
echo ""
echo "=== 7. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ============================================================================
# 8. Commit + push
# ============================================================================
echo ""
echo "=== 8. Commit + push ==="
git add -A
git status --short
git commit -m "Cars: add Car model + Registration.carId + admin Cars page (Step 1)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then:"
echo "  Visit  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<seasonId>"
echo "  Click  'Manage cars →' near the season title"
echo "  Paste  the GT4 / GT3 list into the relevant CarClass textarea"
echo ""
echo "Format examples (one per line):"
echo "  Ferrari 296 GT3, 132"
echo "  Porsche 911 GT3 R (992)"
echo ""
echo "Step 2 (driver-facing dropdown on the registration form) comes next once"
echo "the lists are entered."
