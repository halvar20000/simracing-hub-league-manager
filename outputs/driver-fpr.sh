#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: ScoringSystem.driverFprEnabled + driverFprTiers
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+ScoringSystem\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("ScoringSystem brace not found."); process.exit(1); }

const additions = [];
if (!/^\s*driverFprEnabled\s+Boolean/m.test(s)) additions.push("  driverFprEnabled         Boolean @default(false)");
if (!/^\s*driverFprTiers\s+Json\?/m.test(s))   additions.push("  driverFprTiers           Json?");

if (additions.length > 0) {
  lines.splice(close, 0, ...additions);
  fs.writeFileSync(FILE, lines.join("\n"));
  console.log(`ScoringSystem: added ${additions.length} field(s).`);
} else {
  console.log("Schema: driver FPR fields already present.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Helper: src/lib/driver-fpr.ts
# ===========================================================================
cat > src/lib/driver-fpr.ts <<'TS'
export interface DriverFprTier {
  /** Maximum incident count to qualify for this tier (inclusive). */
  maxInc: number;
  /** FPR points awarded for this tier. */
  points: number;
}

/**
 * Default tiers used when the scoring system has driverFprEnabled but the
 * driverFprTiers JSON isn't customised (matches CAS Combined Cup):
 *   0-2 inc → 3, 3-5 inc → 2, 6-7 inc → 1, 8+ inc → 0
 */
export const DEFAULT_DRIVER_FPR_TIERS: DriverFprTier[] = [
  { maxInc: 2, points: 3 },
  { maxInc: 5, points: 2 },
  { maxInc: 7, points: 1 },
];

export function readDriverFprTiers(raw: unknown): DriverFprTier[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DRIVER_FPR_TIERS];
  const out: DriverFprTier[] = [];
  for (const t of raw) {
    if (
      t &&
      typeof t === "object" &&
      typeof (t as { maxInc?: unknown }).maxInc === "number" &&
      typeof (t as { points?: unknown }).points === "number"
    ) {
      out.push({
        maxInc: Math.max(0, Math.floor((t as DriverFprTier).maxInc)),
        points: Math.max(0, Math.floor((t as DriverFprTier).points)),
      });
    }
  }
  // Sort ascending by maxInc so the first match wins.
  out.sort((a, b) => a.maxInc - b.maxInc);
  return out.length > 0 ? out : [...DEFAULT_DRIVER_FPR_TIERS];
}

/** Map an incident count to FPR points using the supplied tiers. */
export function fprPointsForIncidents(
  incidents: number,
  tiers: DriverFprTier[]
): number {
  for (const t of tiers) {
    if (incidents <= t.maxInc) return t.points;
  }
  return 0;
}
TS
echo "[+] Wrote src/lib/driver-fpr.ts"

# ===========================================================================
# 3. Standings: include FPR per round in combinedTotal + roundPoints
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// 3a. Import helper
if (!s.includes('from "@/lib/driver-fpr"')) {
  s = s.replace(
    `import type { PrismaClient } from "@prisma/client";`,
    `import type { PrismaClient } from "@prisma/client";\nimport { readDriverFprTiers, fprPointsForIncidents } from "@/lib/driver-fpr";`
  );
}

// 3b. Add fprPoints fields to RoundPoints + DriverStanding interfaces
if (!s.includes("fprPoints: number")) {
  s = s.replace(
    `  penaltyPoints: number;
  correctionPoints: number;`,
    `  penaltyPoints: number;
  correctionPoints: number;
  fprPoints: number;`
  );
  s = s.replace(
    `  manualPenalties: number;
  combinedTotal: number;`,
    `  manualPenalties: number;
  fprPoints: number;
  combinedTotal: number;`
  );
}

// 3c. Compute tiers + flag near the top
if (!s.includes("driverFprEnabled =")) {
  s = s.replace(
    `  const includeParticipationInCombined =
    season?.scoringSystem.participationInCombined ?? true;
  const defersPenalties = !!season?.scoringSystem?.deferPenaltyPoints;`,
    `  const includeParticipationInCombined =
    season?.scoringSystem.participationInCombined ?? true;
  const defersPenalties = !!season?.scoringSystem?.deferPenaltyPoints;
  const driverFprEnabled = !!season?.scoringSystem?.driverFprEnabled;
  const driverFprTiers = driverFprEnabled
    ? readDriverFprTiers(season?.scoringSystem?.driverFprTiers)
    : [];`
  );
}

// 3d. Add per-driver fpr accumulator next to other accumulators
if (!s.includes("let fprTotal = 0")) {
  s = s.replace(
    `    let raw = 0;
    let classRaw = 0;
    let participation = 0;
    let penalty = 0;
    let correction = 0;
    let totalIncidents = 0;`,
    `    let raw = 0;
    let classRaw = 0;
    let participation = 0;
    let penalty = 0;
    let correction = 0;
    let totalIncidents = 0;
    let fprTotal = 0;`
  );
}

// 3e. Compute FPR per round and accumulate. We piggy-back on the per-round
//     loop that already groups results by roundId. Add it just after the
//     existing per-round loop where roundPoints is built.
if (!s.includes("// Per-round driver FPR")) {
  // Find the block that constructs `roundPoints` from results grouped by round.
  // We add a small inline calculation inside the per-round mapping.
  const before = `      if (results.length === 0) {
        return {
          roundId: round.id,`;
  const after = `      const roundIncidents = results.reduce((sum, r) => sum + (r.incidents ?? 0), 0);
      // Per-round driver FPR — based on TOTAL incidents in the round.
      const roundFpr = driverFprEnabled
        ? fprPointsForIncidents(roundIncidents, driverFprTiers)
        : 0;
      if (results.length > 0) fprTotal += roundFpr;

      if (results.length === 0) {
        return {
          roundId: round.id,`;
  if (s.includes(before)) s = s.replace(before, after);
}

// 3f. Add fprPoints to the empty roundPoints branch + filled branch.
if (!s.includes("fprPoints: 0")) {
  s = s.replace(
    `          penaltyPoints: 0,`,
    `          penaltyPoints: 0,
          fprPoints: 0,`
  );
}

if (!s.includes("fprPoints: roundFpr")) {
  // Find the constructed RoundPoints object that has penaltyPoints: rPen and add fprPoints next to it.
  s = s.replace(
    `        penaltyPoints: rPen,`,
    `        penaltyPoints: rPen,
        fprPoints: roundFpr,`
  );
}

// 3g. Bake fprTotal into the final standing object + combinedTotal.
if (!s.includes("fprPoints: fprTotal")) {
  s = s.replace(
    `      manualPenalties: penalty,
      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction,
      classTotal: classRaw + participation - penalty + correction,`,
    `      manualPenalties: penalty,
      fprPoints: fprTotal,
      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction + fprTotal,
      classTotal: classRaw + participation - penalty + correction + fprTotal,`
  );
}

fs.writeFileSync(FILE, s);
console.log("Standings: driver FPR wired.");
EOF
node outputs-tmp/patch-standings.mjs

# ===========================================================================
# 4. Scoring system edit page: new "Driver FPR" section
# ===========================================================================
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Helper imports
if (!s.includes('from "@/lib/driver-fpr"')) {
  s = s.replace(
    'import { readCategoryPoints, PENALTY_LEVELS, PENALTY_LEVEL_LABEL } from "@/lib/penalty-categories";',
    'import { readCategoryPoints, PENALTY_LEVELS, PENALTY_LEVEL_LABEL } from "@/lib/penalty-categories";\nimport { readDriverFprTiers, DEFAULT_DRIVER_FPR_TIERS } from "@/lib/driver-fpr";'
  );
}

// Compute tiers near the top of the component body.
if (!s.includes("const driverFprTiers =")) {
  s = s.replace(
    "  const categoryPoints = readCategoryPoints(ss.categoryPointsTable);",
    "  const categoryPoints = readCategoryPoints(ss.categoryPointsTable);\n  const driverFprTiers = readDriverFprTiers(ss.driverFprTiers);"
  );
}

// Insert a new Section just before "Drop weeks"
if (!s.includes('name="driverFprEnabled"')) {
  const before = `        <Section title="Drop weeks">`;
  const insert = `        <Section title="Driver Fair Play Rating (incident-based)">
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              name="driverFprEnabled"
              defaultChecked={ss.driverFprEnabled}
              className="mt-0.5 h-4 w-4 accent-orange-500"
            />
            <span>
              <span className="font-medium">Enable driver FPR</span>
              <span className="ml-1 block text-xs text-zinc-500">
                Awards FPR points to each driver per round based on the total
                incidents across all races in that round. Added to combined
                + class totals.
              </span>
            </span>
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Tier {i + 1}
                </div>
                <Field
                  label="Up to N incidents"
                  name={\`fprTier\${i}MaxInc\`}
                  type="number"
                  defaultValue={String(driverFprTiers[i]?.maxInc ?? DEFAULT_DRIVER_FPR_TIERS[i]?.maxInc ?? 0)}
                  min={0}
                  max={50}
                />
                <Field
                  label="FPR points"
                  name={\`fprTier\${i}Points\`}
                  type="number"
                  defaultValue={String(driverFprTiers[i]?.points ?? DEFAULT_DRIVER_FPR_TIERS[i]?.points ?? 0)}
                  min={0}
                  max={20}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Drivers with more incidents than the highest tier earn 0 FPR.
            Default for CAS Combined Cup: 0–2 inc → 3, 3–5 inc → 2, 6–7 inc → 1.
          </p>
        </Section>

        <Section title="Drop weeks">`;
  if (!s.includes(before)) { console.error("Edit form: 'Drop weeks' anchor not found."); process.exit(1); }
  s = s.replace(before, insert);
  fs.writeFileSync(FILE, s);
  console.log("Edit form: Driver FPR section added.");
} else {
  console.log("Edit form: Driver FPR already present.");
}
EOF
node outputs-tmp/patch-edit.mjs

# ===========================================================================
# 5. Action: save driverFprEnabled + driverFprTiers
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("driverFprEnabled")) {
  console.log("Action: already wired.");
  process.exit(0);
}

// Read fields
s = s.replace(
  `  const categoryPointsTable = readCategoryPointsFromForm(formData);`,
  `  const categoryPointsTable = readCategoryPointsFromForm(formData);
  const driverFprEnabled = formData.get("driverFprEnabled") === "on";
  const driverFprTiers: { maxInc: number; points: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const m = readIntOrNull(formData.get(\`fprTier\${i}MaxInc\`));
    const pt = readIntOrNull(formData.get(\`fprTier\${i}Points\`));
    if (m != null && pt != null) driverFprTiers.push({ maxInc: m, points: pt });
  }`
);

// Save
s = s.replace(
  `      categoryPointsTable,
      racesPerRound,`,
  `      categoryPointsTable,
      driverFprEnabled,
      driverFprTiers: driverFprTiers.length > 0 ? driverFprTiers : Prisma.DbNull,
      racesPerRound,`
);

fs.writeFileSync(FILE, s);
console.log("Action: driverFprEnabled + driverFprTiers wired.");
EOF
node outputs-tmp/patch-action.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "FPR: add per-driver incident-based Fair Play Rating (configurable tiers per scoring system; CC default 3/2/1/0)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy: open Admin → Scoring systems → CAS Combined Cup → tick 'Enable driver FPR' (defaults will appear)."
