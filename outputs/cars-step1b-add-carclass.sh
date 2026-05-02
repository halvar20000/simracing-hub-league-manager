#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Append addCarClass + deleteCarClass to src/lib/actions/cars.ts
# ---------------------------------------------------------------------------
echo "=== 1. Append addCarClass + deleteCarClass to cars.ts ==="
cat > /tmp/lm_carclass_block.txt <<'BLOCK'

export async function addCarClass(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const iracingIdsRaw = String(formData.get("iracingCarClassIds") ?? "").trim();

  if (!seasonId) throw new Error("seasonId required");
  if (!name) throw new Error("name required");
  if (!shortCode) throw new Error("shortCode required");

  const iracingCarClassIds = iracingIdsRaw
    ? iracingIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map((s) => parseInt(s, 10))
    : [];

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      _count: { select: { carClasses: true } },
    },
  });
  if (!season) throw new Error("Season not found");

  await prisma.carClass.create({
    data: {
      seasonId,
      name,
      shortCode,
      iracingCarClassIds,
      displayOrder: season._count.carClasses,
    },
  });

  revalidatePath(
    `/admin/leagues/${season.league.slug}/seasons/${seasonId}/cars`
  );
}

export async function deleteCarClass(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");

  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      season: { include: { league: true } },
      _count: {
        select: {
          cars: true,
          registrations: true,
          teamResults: true,
        },
      },
    },
  });
  if (!cc) return;

  // Refuse to delete a class that already has registrations / results.
  if (cc._count.registrations > 0 || cc._count.teamResults > 0) {
    throw new Error(
      "Cannot delete a class that already has registrations or race results."
    );
  }

  await prisma.carClass.delete({ where: { id: carClassId } });

  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/cars.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('export async function addCarClass')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_carclass_block.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended addCarClass + deleteCarClass.');
"

# ---------------------------------------------------------------------------
# 2. Update /admin .../cars page to render an Add-class form + per-class delete
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Patch admin cars page ==="
cat > /tmp/lm_patch_cars_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Update import line to include addCarClass + deleteCarClass
s = s.replace(
  /import \{\s*\n\s*addCarsBulk,\s*\n\s*deleteCar,\s*\n\s*updateCarIracingId,\s*\n\} from "@\/lib\/actions\/cars";/,
  `import {
  addCarsBulk,
  deleteCar,
  updateCarIracingId,
  addCarClass,
  deleteCarClass,
} from "@/lib/actions/cars";`
);

// (b) Replace the empty-state paragraph with: always-show Add Class form,
//     and a smaller empty hint when there are no classes yet.
const NEW_BLOCK = `      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Add a car class</h2>
        <form action={addCarClass} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="seasonId" value={seasonId} />
          <div>
            <label className="block text-xs text-zinc-400">Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="GT4"
              className="w-32 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">Short code</label>
            <input
              type="text"
              name="shortCode"
              required
              placeholder="GT4"
              className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400">
              iRacing class id(s) — optional, comma-separated
            </label>
            <input
              type="text"
              name="iracingCarClassIds"
              placeholder="74, 84"
              className="w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
          >
            Add class
          </button>
        </form>
      </section>

      {season.carClasses.length === 0 && (
        <p className="text-sm text-zinc-500">
          No car classes yet for this season — add one above to get started.
        </p>
      )}`;

s = s.replace(
  /\{season\.carClasses\.length === 0 && \(\s*\n\s*<p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-zinc-400">[\s\S]*?<\/p>\s*\n\s*\)\}/,
  NEW_BLOCK
);

// (c) Add a "Delete class" button to each class header (only useful when empty).
s = s.replace(
  /<div className="flex items-center justify-between">\s*\n\s*<h2 className="text-lg font-semibold">\s*\n\s*\{cc\.name\}\{" "\}\s*\n\s*<span className="text-sm text-zinc-500">\s*\n\s*\(\{cc\._count\.cars\} car\{cc\._count\.cars === 1 \? "" : "s"\}\)\s*\n\s*<\/span>\s*\n\s*<\/h2>\s*\n\s*<\/div>/,
  `<div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {cc.name}{" "}
              <span className="text-sm text-zinc-500">
                ({cc._count.cars} car{cc._count.cars === 1 ? "" : "s"})
              </span>
            </h2>
            {cc._count.cars === 0 && (
              <form action={deleteCarClass}>
                <input type="hidden" name="carClassId" value={cc.id} />
                <button
                  type="submit"
                  className="rounded border border-red-900/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                >
                  Delete class
                </button>
              </form>
            )}
          </div>`
);

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched cars page.');
JS
node /tmp/lm_patch_cars_page.js

# ---------------------------------------------------------------------------
# 3. Verify
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. Verify ==="
echo "-- actions --"
grep -n 'export async function addCarClass\|export async function deleteCarClass' src/lib/actions/cars.ts
echo ""
echo "-- page imports + form --"
grep -n 'addCarClass\|deleteCarClass\|Add a car class' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx' | head -10

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
git commit -m "Cars: add inline 'Add car class' form on /cars admin (and delete-when-empty)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on the GT4 TSS '4th season 2026' /cars page:"
echo "  Name:       GT4"
echo "  Short code: GT4"
echo "  iRacing class id: leave blank (or fill 84 if that's the GT4 class id)"
echo "  -> Add class"
echo "  Then paste the GT4 list into its textarea."
