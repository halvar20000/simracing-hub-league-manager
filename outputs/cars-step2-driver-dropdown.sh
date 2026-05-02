#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

REGFILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'
ACTFILE='src/lib/actions/registrations.ts'

# ============================================================================
# 1. PAGE: include cars on the carClasses query
# ============================================================================
echo "=== 1. Page: include cars on carClasses query ==="
cat > /tmp/lm_page_p1.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

s = s.replace(
  /prisma\.carClass\.findMany\(\{\s*\n\s*where: \{ seasonId \},\s*\n\s*orderBy: \{ displayOrder: "asc" \},\s*\n\s*\}\),/,
  `prisma.carClass.findMany({
      where: { seasonId },
      orderBy: { displayOrder: "asc" },
      include: {
        cars: { orderBy: { displayOrder: "asc" } },
      },
    }),`
);

if (s === before) { console.error('  Anchor not found.'); process.exit(1); }
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_page_p1.js "$REGFILE"

# ============================================================================
# 2. PAGE: add hasCars / carLocked / lockedCar before the return
# ============================================================================
echo ""
echo "=== 2. Page: add hasCars / carLocked / lockedCar ==="
cat > /tmp/lm_page_p2.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('const hasCars =')) { console.log('  Already present.'); process.exit(0); }

const inject = `  const hasCars = carClasses.some((cc) => cc.cars.length > 0);
  const carLocked = !!existing?.carId && season.status === "ACTIVE";
  const lockedCarId = carLocked ? existing?.carId ?? null : null;
  const lockedCar = lockedCarId
    ? carClasses.flatMap((cc) => cc.cars).find((c) => c.id === lockedCarId) ?? null
    : null;

`;

const before = s;
s = s.replace(
  /(const isUpdate =\s*\n\s*existing &&\s*\n\s*existing\.status !== "WITHDRAWN" &&\s*\n\s*existing\.status !== "REJECTED";\s*\n\n)(\s*return \()/,
  '$1' + inject + '$2'
);
if (s === before) { console.error('  Anchor not found.'); process.exit(1); }
fs.writeFileSync(FILE, s);
console.log('  Inserted.');
JS
node /tmp/lm_page_p2.js "$REGFILE"

# ============================================================================
# 3. PAGE: insert the Car select block before Notes
# ============================================================================
echo ""
echo "=== 3. Page: insert Car select before Notes ==="
cat > /tmp/lm_car_block.txt <<'JSX'
        {hasCars && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Car <span className="text-orange-400">*</span>
            </span>
            {carLocked ? (
              <div className="space-y-1">
                <input
                  type="hidden"
                  name="carId"
                  value={existing?.carId ?? ""}
                />
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                  {lockedCar?.name ?? "—"}
                </div>
                <span className="block text-xs text-amber-300">
                  Locked — your car cannot be changed once the season is
                  active.
                </span>
              </div>
            ) : (
              <select
                name="carId"
                required
                defaultValue={existing?.carId ?? ""}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select car…</option>
                {season.isMulticlass
                  ? carClasses
                      .filter((cc) => cc.cars.length > 0)
                      .map((cc) => (
                        <optgroup key={cc.id} label={cc.name}>
                          {cc.cars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ))
                  : carClasses
                      .flatMap((cc) => cc.cars)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
              </select>
            )}
          </label>
        )}

JSX

cat > /tmp/lm_page_p3.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('Car <span className="text-orange-400">*</span>')) {
  console.log('  Already present.'); process.exit(0);
}

const block = fs.readFileSync('/tmp/lm_car_block.txt', 'utf8');

const before = s;
s = s.replace(
  /(\n\s*<label className="block">\s*\n\s*<span className="mb-1 block text-sm text-zinc-300">\s*\n\s*Notes \(optional\))/,
  '\n' + block + '$1'
);
if (s === before) { console.error('  Anchor not found.'); process.exit(1); }
fs.writeFileSync(FILE, s);
console.log('  Inserted.');
JS
node /tmp/lm_page_p3.js "$REGFILE"

# ============================================================================
# 4. ACTION: parse carId, validate, lock-check, save it
# ============================================================================
echo ""
echo "=== 4. Action: parse carId + validate + lock + save ==="
cat > /tmp/lm_act_p.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Parse carId alongside other formData fields
if (!/const carId =/.test(s)) {
  s = s.replace(
    /const carClassId = String\(formData\.get\("carClassId"\) \?\? ""\)\.trim\(\) \|\| null;/,
    `const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const carId = String(formData.get("carId") ?? "").trim() || null;`
  );
}

// (b) Insert validation block right after the multiclass class-required check
if (!/let resolvedCarClassId/.test(s)) {
  const VALID = `

  // Validate car if provided; auto-resolve carClassId for non-multiclass seasons
  let resolvedCarClassId: string | null = carClassId;
  if (carId) {
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: { seasonId: true, carClassId: true },
    });
    if (!car || car.seasonId !== seasonId) {
      redirect(
        \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=Invalid+car\`
      );
    }
    if (season.isMulticlass && carClassId && car.carClassId !== carClassId) {
      redirect(
        \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=Car+does+not+belong+to+selected+class\`
      );
    }
    if (!resolvedCarClassId) {
      resolvedCarClassId = car.carClassId;
    }
  }

  // If any class has cars defined, car selection is required
  const classesWithCars = await prisma.carClass.findMany({
    where: { seasonId, cars: { some: {} } },
    select: { id: true },
  });
  if (classesWithCars.length > 0 && !carId) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=Car+is+required\`
    );
  }
`;
  s = s.replace(
    /(if \(season\.isMulticlass && !carClassId\) \{\s*\n\s*redirect\(\s*\n\s*`\/leagues\/\$\{leagueSlug\}\/seasons\/\$\{seasonId\}\/register\?error=Class\+is\+required\+for\+multiclass\+seasons`\s*\n\s*\);\s*\n\s*\})/,
    '$1' + VALID
  );
}

// (c) Lock-check after the "already approved" guard
if (!/error=Car\+is\+locked\+after\+season\+start/.test(s)) {
  const LOCK = `

  if (
    existing &&
    existing.carId &&
    season.status === "ACTIVE" &&
    existing.carId !== carId
  ) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/register?error=Car+is+locked+after+season+start\`
    );
  }
`;
  s = s.replace(
    /(if \(existing && existing\.status === "APPROVED"\) \{\s*\n\s*redirect\(\s*\n\s*`\/registrations\?error=You\+are\+already\+approved\+for\+this\+season`\s*\n\s*\);\s*\n\s*\})/,
    '$1' + LOCK
  );
}

// (d) Save carId + use resolvedCarClassId in update + create blocks
// (d.1) UPDATE block
s = s.replace(
  /(await prisma\.registration\.update\(\{\s*\n\s*where: \{ id: existing\.id \},\s*\n\s*data: \{\s*\n\s*status: "PENDING",\s*\n\s*startNumber,\s*\n\s*teamId,\s*\n\s*)carClassId,(\s*\n\s*notes,)/,
  '$1carClassId: resolvedCarClassId,\n        carId,$2'
);

// (d.2) CREATE block
s = s.replace(
  /(await prisma\.registration\.create\(\{\s*\n\s*data: \{\s*\n\s*seasonId,\s*\n\s*userId: user\.id,\s*\n\s*status: "PENDING",\s*\n\s*startNumber,\s*\n\s*teamId,\s*\n\s*)carClassId,(\s*\n\s*notes,)/,
  '$1carClassId: resolvedCarClassId,\n        carId,$2'
);

if (s === before) { console.error('  No anchors matched.'); process.exit(1); }
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_act_p.js "$ACTFILE"

# ============================================================================
# 5. Verify
# ============================================================================
echo ""
echo "=== 5. Verify ==="
echo "-- page anchors --"
grep -n 'cars: { orderBy:\|const hasCars =\|const carLocked =\|name="carId"' "$REGFILE" | head -10
echo ""
echo "-- action anchors --"
grep -n 'const carId = String\|let resolvedCarClassId\|classesWithCars\|locked+after+season+start\|carClassId: resolvedCarClassId\|carId,' "$ACTFILE" | head -20

# ============================================================================
# 6. TS check
# ============================================================================
echo ""
echo "=== 6. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ============================================================================
# 7. Commit + push
# ============================================================================
echo ""
echo "=== 7. Commit + push ==="
git add -A
git status --short
git commit -m "Registration: car dropdown on form + carId validation, required when cars exist, locked after season start"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Test plan:"
echo "  1) Open the GT3 WCT registration page (with valid ?t= if token-protected)."
echo "     -> A new 'Car *' dropdown appears, listing the 11 GT3 cars."
echo "  2) Submit without picking -> redirected back with error 'Car is required'."
echo "  3) Pick a car and submit -> registration saved with carId."
echo "  4) Re-open the form -> your previously-picked car is the default."
echo "  5) Once you flip the season status to ACTIVE, re-open the form ->"
echo "     car field shows as locked text instead of a dropdown."
echo "  6) On the IEC season (multiclass, no cars yet) the dropdown is hidden,"
echo "     so the form behaves exactly as before."
