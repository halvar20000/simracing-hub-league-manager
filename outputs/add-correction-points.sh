#!/usr/bin/env bash
# Add per-RaceResult correctionPoints (manual top-up / deduction) to keep
# our totals aligned with iRLM during the parallel-run period.
#  - Schema: RaceResult.correctionPoints Int @default(0)
#  - Scoring engine: include in totals
#  - Standings: include in season + per-round totals (NOT dropped on drop-week)
#  - Admin round page: editable input
#  - Server action: parse + persist
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp scripts

# ---------------------------------------------------------------
# 1) Schema
# ---------------------------------------------------------------
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
const start = s.indexOf("model RaceResult {");
const end = s.indexOf("}", start);
const block = s.slice(start, end);
if (/correctionPoints\s+Int\b/.test(block)) {
  console.log("schema: correctionPoints already present.");
} else {
  s = s.slice(0, end) + "  correctionPoints Int       @default(0)\n" + s.slice(end);
  fs.writeFileSync(FILE, s);
  console.log("schema: added RaceResult.correctionPoints.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

# ---------------------------------------------------------------
# 2) Standings: include correctionPoints in per-round + per-season totals,
#    do NOT subtract on drop.
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) RoundPoints interface gains correctionPoints
const ifaceA = "  penaltyPoints: number;\n  combinedPoints: number;";
const ifaceA2 = "  penaltyPoints: number;\n  correctionPoints: number;\n  combinedPoints: number;";
if (!s.includes("correctionPoints: number;")) {
  if (!s.includes(ifaceA)) { console.error("RoundPoints anchor missing"); process.exit(1); }
  s = s.replace(ifaceA, ifaceA2);
  console.log("standings: added correctionPoints to RoundPoints interface.");
}

// (b) Per-driver season aggregation: declare + sum correction
const aggBefore = "    let raw = 0;\n    let classRaw = 0;\n    let participation = 0;\n    let penalty = 0;\n    let totalIncidents = 0;";
const aggAfter  = "    let raw = 0;\n    let classRaw = 0;\n    let participation = 0;\n    let penalty = 0;\n    let correction = 0;\n    let totalIncidents = 0;";
if (!s.includes("let correction = 0;")) {
  if (!s.includes(aggBefore)) { console.error("aggregation init anchor missing"); process.exit(1); }
  s = s.replace(aggBefore, aggAfter);
  console.log("standings: declared correction accumulator.");
}

const sumBefore = "      raw += r.rawPointsAwarded;\n      participation += r.participationPointsAwarded;\n      penalty += r.manualPenaltyPoints;";
const sumAfter  = "      raw += r.rawPointsAwarded;\n      participation += r.participationPointsAwarded;\n      penalty += r.manualPenaltyPoints;\n      correction += r.correctionPoints;";
if (!s.includes("correction += r.correctionPoints;")) {
  if (!s.includes(sumBefore)) { console.error("aggregation sum anchor missing"); process.exit(1); }
  s = s.replace(sumBefore, sumAfter);
  console.log("standings: sum correctionPoints in season aggregation.");
}

// (c) Per-round roundPoints: declare rCorrection + add it to totals
//     For with-result branch: replace rRaw / rPart / rPen sums and set rCorrection.
const rrBefore = "      const rRaw = results.reduce((sum, r) => sum + r.rawPointsAwarded, 0);\n      const rPart = results.reduce(\n        (sum, r) => sum + r.participationPointsAwarded,\n        0\n      );\n      const rPen = results.reduce(\n        (sum, r) => sum + r.manualPenaltyPoints,\n        0\n      );";
const rrAfter  = rrBefore + "\n      const rCorrection = results.reduce(\n        (sum, r) => sum + r.correctionPoints,\n        0\n      );";
if (!s.includes("const rCorrection = results.reduce(")) {
  if (!s.includes(rrBefore)) { console.error("per-round sum anchor missing"); process.exit(1); }
  s = s.replace(rrBefore, rrAfter);
  console.log("standings: per-round rCorrection sum added.");
}

// Add correctionPoints to roundPoints with-result return
const retBefore = "        combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen,\n        classPoints: rClassRaw + rPart - rPen,\n        hasResult: true,";
const retAfter  = "        correctionPoints: rCorrection,\n        combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen + rCorrection,\n        classPoints: rClassRaw + rPart - rPen + rCorrection,\n        hasResult: true,";
if (!s.includes("correctionPoints: rCorrection,")) {
  if (!s.includes(retBefore)) { console.error("with-result return anchor missing"); process.exit(1); }
  s = s.replace(retBefore, retAfter);
  console.log("standings: with-result return includes correction.");
}

// Add correctionPoints to no-result return
const noResBefore = "          penaltyPoints: 0,\n          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,";
const noResAfter  = "          penaltyPoints: 0,\n          correctionPoints: 0,\n          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,";
if (!s.includes("correctionPoints: 0,")) {
  if (!s.includes(noResBefore)) { console.error("no-result return anchor missing"); process.exit(1); }
  s = s.replace(noResBefore, noResAfter);
  console.log("standings: no-result return includes correction.");
}

// (d) Final season totals: add correction to combinedTotal + classTotal
const totBefore = "      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty,\n      classTotal: classRaw + participation - penalty,";
const totAfter  = "      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction,\n      classTotal: classRaw + participation - penalty + correction,";
if (!s.includes("- penalty + correction,")) {
  if (!s.includes(totBefore)) { console.error("season total anchor missing"); process.exit(1); }
  s = s.replace(totBefore, totAfter);
  console.log("standings: season totals include correction.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings.mjs

# ---------------------------------------------------------------
# 3) upsertRaceResult action: parse + persist correctionPoints
# ---------------------------------------------------------------
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/race-results.ts";
let s = fs.readFileSync(FILE, "utf8");

// Parse
const parseBefore = "  const manualPenaltyPoints = parseInt(manualPenaltyPointsRaw, 10) || 0;";
const parseAfter  = parseBefore + "\n  const correctionPointsRaw = String(\n    formData.get(\"correctionPoints\") ?? \"0\"\n  );\n  const correctionPoints = parseInt(correctionPointsRaw, 10) || 0;";
if (!s.includes("const correctionPoints =")) {
  if (!s.includes(parseBefore)) { console.error("parse anchor missing"); process.exit(1); }
  s = s.replace(parseBefore, parseAfter);
  console.log("action: parsed correctionPoints.");
}

// Persist (data object)
const dataBefore = "    manualPenaltyPoints,\n    manualPenaltyReason,";
const dataAfter  = "    manualPenaltyPoints,\n    correctionPoints,\n    manualPenaltyReason,";
if (!s.includes("correctionPoints,")) {
  if (!s.includes(dataBefore)) { console.error("data anchor missing"); process.exit(1); }
  s = s.replace(dataBefore, dataAfter);
  console.log("action: persisted correctionPoints in data.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-action.mjs

# ---------------------------------------------------------------
# 4) Admin round page: row type + form Field + new column display
# ---------------------------------------------------------------
cat > outputs-tmp/patch-admin-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Inline raceResults row type
const typeBefore = "      manualPenaltyPoints: number;\n      manualPenaltyReason: string | null;";
const typeAfter  = "      manualPenaltyPoints: number;\n      correctionPoints: number;\n      manualPenaltyReason: string | null;";
if (!s.includes("correctionPoints: number;")) {
  if (!s.includes(typeBefore)) { console.error("inline type anchor missing"); process.exit(1); }
  s = s.replace(typeBefore, typeAfter);
  console.log("admin round: row type includes correctionPoints.");
}

// (b) Total points calculation in the form header
const totBefore = "      result.rawPointsAwarded +\n      result.participationPointsAwarded -\n      result.manualPenaltyPoints";
const totAfter  = "      result.rawPointsAwarded +\n      result.participationPointsAwarded -\n      result.manualPenaltyPoints +\n      result.correctionPoints";
if (!s.includes("+\n      result.correctionPoints")) {
  if (!s.includes(totBefore)) { console.error("totalPoints anchor missing"); process.exit(1); }
  s = s.replace(totBefore, totAfter);
  console.log("admin round: header total includes correction.");
}

// (c) New Field in the grid — placed right after Penalty pts.
const penFieldBefore =
  '        <Field\n' +
  '          label="Penalty pts"\n' +
  '          name="manualPenaltyPoints"\n' +
  '          type="number"\n' +
  '          defaultValue={String(result?.manualPenaltyPoints ?? 0)}\n' +
  '          min={0}\n' +
  '        />';
const penFieldAfter = penFieldBefore +
  '\n        <Field\n' +
  '          label="Correction"\n' +
  '          name="correctionPoints"\n' +
  '          type="number"\n' +
  '          defaultValue={String(result?.correctionPoints ?? 0)}\n' +
  '          placeholder="+/- adjust"\n' +
  '        />';
if (!s.includes('label="Correction"')) {
  if (!s.includes(penFieldBefore)) { console.error("penalty field anchor missing"); process.exit(1); }
  s = s.replace(penFieldBefore, penFieldAfter);
  console.log("admin round: Correction Field added next to Penalty pts.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-admin-round.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 5) Recompute scoring (no behaviour change since all corrections are 0)
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
echo "=== Recompute (no-op for now since all corrections default to 0) ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Scoring: add correctionPoints (manual +/- adjustment, never dropped)"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Every admin round row form gets a 'Correction' input next to 'Penalty pts'."
echo "  - Save Row persists the correction; the row's points + season totals"
echo "    immediately reflect it."
echo "  - Drop-week leaves corrections in place (same rule as penalties)."
echo "  - Standings show Total only — corrections fold in silently."
