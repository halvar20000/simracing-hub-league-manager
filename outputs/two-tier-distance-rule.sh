#!/usr/bin/env bash
# Two-tier distance rule:
#  - >= racePointsMinDistancePct (default 50%) -> position points awarded
#  - >= participationMinDistancePct (default 75%) -> ALSO participation points
#  - DSQ / DNS -> always 0 regardless of distance
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp scripts

# ---------------------------------------------------------------
# 1) Schema: add racePointsMinDistancePct
# ---------------------------------------------------------------
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
const start = s.indexOf("model ScoringSystem {");
const end = s.indexOf("}", start);
const block = s.slice(start, end);
if (/racePointsMinDistancePct\s+Int\b/.test(block)) {
  console.log("schema: field already present.");
} else {
  // Insert next to participationMinDistancePct for cleanliness
  const anchor = "  participationMinDistancePct   Int       @default(75)";
  if (!s.includes(anchor)) {
    console.error("Could not find participationMinDistancePct anchor.");
    process.exit(1);
  }
  s = s.replace(
    anchor,
    anchor +
      "\n  racePointsMinDistancePct      Int       @default(50)"
  );
  fs.writeFileSync(FILE, s);
  console.log("schema: added racePointsMinDistancePct.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

# ---------------------------------------------------------------
# 2) scoring.ts: extend calculateRawPoints + caller
# ---------------------------------------------------------------
cat > outputs-tmp/patch-scoring.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/scoring.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Function signature + body: add raceDistancePct + threshold args
const before =
`export function calculateRawPoints(
  finishPosition: number,
  finishStatus: FinishStatus,
  pointsTable: PointsTable
): number {
  if (finishStatus !== "CLASSIFIED") return 0;
  if (finishPosition < 1) return 0;
  return pointsTable[String(finishPosition)] ?? 0;
}`;
const after =
`export function calculateRawPoints(
  finishPosition: number,
  finishStatus: FinishStatus,
  raceDistancePct: number,
  racePointsMinDistancePct: number,
  pointsTable: PointsTable
): number {
  // DSQ and DNS never score.
  if (finishStatus === "DSQ" || finishStatus === "DNS") return 0;
  // Below the distance threshold: no position points.
  if (raceDistancePct < racePointsMinDistancePct) return 0;
  if (finishPosition < 1) return 0;
  return pointsTable[String(finishPosition)] ?? 0;
}`;
if (s.includes("racePointsMinDistancePct: number,\n  pointsTable: PointsTable")) {
  console.log("scoring.ts: calculateRawPoints already updated.");
} else if (!s.includes(before)) {
  console.error("scoring.ts: calculateRawPoints anchor missing.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  console.log("scoring.ts: calculateRawPoints signature + logic updated.");
}

// (b) Caller: recomputeResultPoints — pass raceDistancePct + threshold
const callBefore =
`  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    pointsTable
  );`;
const callAfter =
`  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    result.raceDistancePct,
    scoring.racePointsMinDistancePct,
    pointsTable
  );`;
if (s.includes("scoring.racePointsMinDistancePct,\n    pointsTable")) {
  console.log("scoring.ts: caller already updated.");
} else if (!s.includes(callBefore)) {
  console.error("scoring.ts: calculateRawPoints call anchor missing.");
  process.exit(1);
} else {
  s = s.replace(callBefore, callAfter);
  console.log("scoring.ts: caller passes raceDistancePct + threshold.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-scoring.mjs

# ---------------------------------------------------------------
# 3) standings.ts: class re-ranking includes drivers above the threshold
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// We need the season scoring system's racePointsMinDistancePct in scope.
// The standings function loads season + scoringSystem; we just need to use
// it inside the class re-rank loop.

const before =
`      const classified = round.raceResults
        .filter((r) => r.finishStatus === "CLASSIFIED")
        .sort((a, b) => a.finishPosition - b.finishPosition);`;
const after =
`      // Include any driver who'd earn position points (above the
      // racePointsMinDistancePct threshold and not DSQ/DNS).
      const minPct = season?.scoringSystem.racePointsMinDistancePct ?? 50;
      const classified = round.raceResults
        .filter(
          (r) =>
            r.finishStatus !== "DSQ" &&
            r.finishStatus !== "DNS" &&
            r.raceDistancePct >= minPct
        )
        .sort((a, b) => a.finishPosition - b.finishPosition);`;

if (s.includes("racePointsMinDistancePct ?? 50")) {
  console.log("standings.ts: class re-rank already updated.");
} else if (!s.includes(before)) {
  console.error("standings.ts: class re-rank anchor missing.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings.ts: class re-rank now includes >=50% finishers.");
}
EOF
node outputs-tmp/patch-standings.mjs

# ---------------------------------------------------------------
# 4) Admin scoring-system edit page: add the new field
# ---------------------------------------------------------------
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '            <Field\n              label="Min distance % to qualify for participation pts"\n              name="participationMinDistancePct"\n              type="number"\n              defaultValue={String(ss.participationMinDistancePct)}\n              min={0}\n              max={100}\n            />';
const after = before +
  '\n            <Field\n              label="Min distance % to earn race position points"\n              name="racePointsMinDistancePct"\n              type="number"\n              defaultValue={String(ss.racePointsMinDistancePct)}\n              min={0}\n              max={100}\n            />';

if (s.includes('name="racePointsMinDistancePct"')) {
  console.log("edit page: already has racePointsMinDistancePct field.");
} else if (!s.includes(before)) {
  console.error("edit page anchor missing.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("edit page: added racePointsMinDistancePct field.");
}
EOF
node outputs-tmp/patch-edit.mjs

# ---------------------------------------------------------------
# 5) Action: parse + persist racePointsMinDistancePct
# ---------------------------------------------------------------
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

const parseBefore =
  '  const participationMinDistancePct =\n    readIntOrNull(formData.get("participationMinDistancePct")) ?? 75;';
const parseAfter = parseBefore +
  '\n  const racePointsMinDistancePct =\n    readIntOrNull(formData.get("racePointsMinDistancePct")) ?? 50;';
if (!s.includes('readIntOrNull(formData.get("racePointsMinDistancePct"))')) {
  if (!s.includes(parseBefore)) {
    console.error("action parse anchor missing.");
    process.exit(1);
  }
  s = s.replace(parseBefore, parseAfter);
  console.log("action: parses racePointsMinDistancePct.");
}

const dataBefore = "      participationMinDistancePct,";
const dataAfter  = "      participationMinDistancePct,\n      racePointsMinDistancePct,";
if (!s.includes("racePointsMinDistancePct,")) {
  if (!s.includes(dataBefore)) {
    console.error("action data anchor missing.");
    process.exit(1);
  }
  s = s.replace(dataBefore, dataAfter);
  console.log("action: data object includes racePointsMinDistancePct.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-action.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 6) Recompute all rounds with the new rule
# ---------------------------------------------------------------
cat > scripts/recompute-all-rounds.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";
async function main() {
  const rounds = await prisma.round.findMany({
    where: { raceResults: { some: {} } },
    select: { id: true, roundNumber: true, season: { select: { name: true, league: { select: { slug: true } } } } },
    orderBy: [{ season: { league: { slug: "asc" } } }, { season: { name: "asc" } }, { roundNumber: "asc" }],
  });
  for (const r of rounds) {
    await recomputeRoundScoring(prisma, r.id);
    console.log(`Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
echo ""
echo "=== Recompute all rounds ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Scoring: two-tier distance rule (>=50% earns race pts, >=75% adds participation)"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Robert Zellner at Spa AM: 3 race pts (P18 in AM, 59% distance > 50%)."
echo "  - Combined: still 0 (P30 isn't in the points table)."
echo "  - <50% finishers / DSQ / DNS still score 0."
echo "  - You can tune the 50% threshold per scoring system at /admin/scoring-systems/<id>/edit."
