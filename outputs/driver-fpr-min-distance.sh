#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add driverFprMinDistancePct Int @default(90) to ScoringSystem
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/driverFprMinDistancePct/.test(s)) {
  console.log("Schema: driverFprMinDistancePct already present.");
  process.exit(0);
}
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+ScoringSystem\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("ScoringSystem brace not found."); process.exit(1); }
lines.splice(close, 0, "  driverFprMinDistancePct  Int     @default(90)");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added driverFprMinDistancePct.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Standings: enforce min distance per round (eligibility check)
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// 2a. Add minDistancePct read
if (!s.includes("driverFprMinDistance")) {
  s = s.replace(
    `  const driverFprTiers = driverFprEnabled
    ? readDriverFprTiers(season?.scoringSystem?.driverFprTiers)
    : [];`,
    `  const driverFprTiers = driverFprEnabled
    ? readDriverFprTiers(season?.scoringSystem?.driverFprTiers)
    : [];
  const driverFprMinDistance = season?.scoringSystem?.driverFprMinDistancePct ?? 90;`
  );
}

// 2b. Update the eligibility check on the per-round FPR calculation
const before = `      const roundIncidents = results.reduce((sum, r) => sum + (r.incidents ?? 0), 0);
      // Per-round driver FPR — based on TOTAL incidents in the round.
      const roundFpr = driverFprEnabled
        ? fprPointsForIncidents(roundIncidents, driverFprTiers)
        : 0;
      if (results.length > 0) fprTotal += roundFpr;`;
const after = `      const roundIncidents = results.reduce((sum, r) => sum + (r.incidents ?? 0), 0);
      // Per-round driver FPR — based on TOTAL incidents in the round.
      // Eligibility: every race in the round must hit the min-distance threshold.
      const fprEligible = results.length > 0 && results.every(
        (r) => (r.raceDistancePct ?? 0) >= driverFprMinDistance
      );
      const roundFpr = driverFprEnabled && fprEligible
        ? fprPointsForIncidents(roundIncidents, driverFprTiers)
        : 0;
      if (results.length > 0) fprTotal += roundFpr;`;

if (s.includes("fprEligible")) {
  console.log("Standings: eligibility already wired.");
} else if (!s.includes(before)) {
  console.error("Standings: per-round FPR anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  console.log("Standings: min-distance eligibility wired.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings.mjs

# ===========================================================================
# 3. Edit form: add a field for the % threshold inside the FPR section
# ===========================================================================
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes('name="driverFprMinDistancePct"')) {
  console.log("Edit form: minDistancePct already wired.");
  process.exit(0);
}

// Insert the new field just below the tier grid, right before the
// closing </Section>'s explanatory <p>.
const before = `          <p className="mt-2 text-xs text-zinc-500">
            Drivers with more incidents than the highest tier earn 0 FPR.
            Default for CAS Combined Cup: 0–2 inc → 3, 3–5 inc → 2, 6–7 inc → 1.
          </p>
        </Section>

        <Section title="Drop weeks">`;
const after = `          <div className="mt-4 max-w-xs">
            <Field
              label="Min race distance % to qualify for FPR"
              name="driverFprMinDistancePct"
              type="number"
              defaultValue={String(ss.driverFprMinDistancePct ?? 90)}
              min={0}
              max={100}
            />
            <p className="mt-1 text-xs text-zinc-500">
              For multi-race rounds, the driver must hit this threshold in
              every race of the round to earn FPR.
            </p>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Drivers with more incidents than the highest tier earn 0 FPR.
            Default for CAS Combined Cup: 0–2 inc → 3, 3–5 inc → 2, 6–7 inc → 1.
            Default min distance: 90%.
          </p>
        </Section>

        <Section title="Drop weeks">`;

if (!s.includes(before)) { console.error("Edit form: anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Edit form: min distance % field added.");
EOF
node outputs-tmp/patch-edit.mjs

# ===========================================================================
# 4. Action: persist driverFprMinDistancePct
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("driverFprMinDistancePct")) {
  console.log("Action: already wired.");
  process.exit(0);
}

// Read it
s = s.replace(
  `  const driverFprEnabled = formData.get("driverFprEnabled") === "on";`,
  `  const driverFprEnabled = formData.get("driverFprEnabled") === "on";
  const driverFprMinDistancePct =
    readIntOrNull(formData.get("driverFprMinDistancePct")) ?? 90;`
);

// Save it
s = s.replace(
  `      driverFprEnabled,
      driverFprTiers: driverFprTiers.length > 0 ? driverFprTiers : Prisma.DbNull,`,
  `      driverFprEnabled,
      driverFprMinDistancePct,
      driverFprTiers: driverFprTiers.length > 0 ? driverFprTiers : Prisma.DbNull,`
);

fs.writeFileSync(FILE, s);
console.log("Action: driverFprMinDistancePct wired.");
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
git commit -m "FPR: add driverFprMinDistancePct (default 90%) — driver must hit threshold in every race of a round to earn FPR"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
