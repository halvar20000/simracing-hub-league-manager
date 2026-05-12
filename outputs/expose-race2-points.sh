#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------------------
# 1. Edit page: add 'Multi-race weekends' section with racesPerRound + Race 2 table
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add helper at top of component to read the Race 2 table
if (!s.includes("const pointsRace2")) {
  s = s.replace(
    "const points = (ss.pointsTable as Record<string, number>) ?? {};",
    `const points = (ss.pointsTable as Record<string, number>) ?? {};
  const pointsRace2 = (ss.pointsTableRace2 as Record<string, number> | null) ?? {};
  const hasRace2 = Object.keys(pointsRace2).length > 0;`
  );
}

// Insert new section after "Overall points table" Section.
const before = `        <Section title="Overall points table">
          <PointsGrid
            prefix="pos"
            values={points}
            placeholder="(no pts)"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Leave a position blank if it should award 0 points.
          </p>
        </Section>`;

const newSection = `        <Section title="Overall points table">
          <PointsGrid
            prefix="pos"
            values={points}
            placeholder="(no pts)"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Used for race 1 in single-race rounds, and for race 1 of multi-race rounds.
          </p>
        </Section>

        <Section title="Multi-race weekends">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field
              label="Races per round"
              name="racesPerRound"
              type="number"
              defaultValue={String(ss.racesPerRound ?? 1)}
              min={1}
              max={4}
            />
          </div>
          <p className="mt-3 mb-2 text-xs text-zinc-500">
            Race 2 points table {hasRace2 ? "(in use)" : "(empty — race 2 will fall back to the overall table if blank)"}
          </p>
          <PointsGrid
            prefix="posR2"
            values={pointsRace2}
            placeholder="(no pts)"
          />
        </Section>`;

if (s.includes("Multi-race weekends")) {
  console.log("Edit form: Multi-race section already present.");
} else {
  if (!s.includes(before)) { console.error("Edit form: anchor not found."); process.exit(1); }
  s = s.replace(before, newSection);
  fs.writeFileSync(FILE, s);
  console.log("Edit form: Multi-race section + Race 2 table added.");
}
EOF
node outputs-tmp/patch-edit.mjs

# ---------------------------------------------------------------------------
# 2. Action: save racesPerRound + pointsTableRace2
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

// Read racesPerRound + pointsTableRace2
if (!s.includes("racesPerRound:")) {
  s = s.replace(
    "  const pointsTable = readPointsTable(formData, \"pos\", 30);",
    `  const pointsTable = readPointsTable(formData, "pos", 30);
  const pointsTableRace2Raw = readPointsTable(formData, "posR2", 30);
  const pointsTableRace2 =
    Object.keys(pointsTableRace2Raw).length > 0 ? pointsTableRace2Raw : null;
  const racesPerRoundRaw = formData.get("racesPerRound");
  const racesPerRound =
    racesPerRoundRaw == null || String(racesPerRoundRaw).trim() === ""
      ? 1
      : Math.max(1, Math.min(4, parseInt(String(racesPerRoundRaw), 10) || 1));`
  );

  // Add to update block. Find end of update data and inject before closing brace.
  s = s.replace(
    `      participationInCombined,
      deferPenaltyPoints,
      categoryPointsTable,
    },`,
    `      participationInCombined,
      deferPenaltyPoints,
      categoryPointsTable,
      racesPerRound,
      pointsTableRace2:
        pointsTableRace2 === null ? Prisma.DbNull : pointsTableRace2,
    },`
  );
  console.log("Action: racesPerRound + pointsTableRace2 wired.");
} else {
  console.log("Action: already wired.");
}

fs.writeFileSync(FILE, s);
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
git commit -m "Scoring system editor: expose racesPerRound + Race 2 points table"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
