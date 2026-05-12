#!/usr/bin/env bash
# Finish the correctionPoints feature — schema is already done, but the
# previous run died before patching standings/action/admin-round.
# This script tells us exactly which anchor missed and finishes the job.
set -uo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# Don't kill on first failure — we want to see ALL anchor problems at once.
mkdir -p outputs-tmp

# ---------- Standings ----------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");
let changes = 0;

function patch(label, before, after) {
  if (s.includes(after)) { console.log("  [skip] " + label + " — already applied"); return; }
  if (!s.includes(before)) { console.error("  [MISS] " + label + " — anchor not found"); return; }
  s = s.replace(before, after);
  changes++;
  console.log("  [ok  ] " + label);
}

console.log("standings.ts:");

// (a) interface
patch(
  "RoundPoints interface",
  "  penaltyPoints: number;\n  combinedPoints: number;",
  "  penaltyPoints: number;\n  correctionPoints: number;\n  combinedPoints: number;"
);

// (b) accumulator init
patch(
  "let correction = 0",
  "let raw = 0;\n    let classRaw = 0;\n    let participation = 0;\n    let penalty = 0;\n    let totalIncidents = 0;",
  "let raw = 0;\n    let classRaw = 0;\n    let participation = 0;\n    let penalty = 0;\n    let correction = 0;\n    let totalIncidents = 0;"
);

// (c) sum correction in season aggregation
patch(
  "season aggregation += correction",
  "raw += r.rawPointsAwarded;\n      participation += r.participationPointsAwarded;\n      penalty += r.manualPenaltyPoints;",
  "raw += r.rawPointsAwarded;\n      participation += r.participationPointsAwarded;\n      penalty += r.manualPenaltyPoints;\n      correction += r.correctionPoints;"
);

// (d) per-round rCorrection
patch(
  "per-round rCorrection sum",
  "      const rPen = results.reduce(\n        (sum, r) => sum + r.manualPenaltyPoints,\n        0\n      );",
  "      const rPen = results.reduce(\n        (sum, r) => sum + r.manualPenaltyPoints,\n        0\n      );\n      const rCorrection = results.reduce(\n        (sum, r) => sum + r.correctionPoints,\n        0\n      );"
);

// (e) with-result return
patch(
  "with-result return correctionPoints + totals",
  "        combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen,\n        classPoints: rClassRaw + rPart - rPen,\n        hasResult: true,",
  "        correctionPoints: rCorrection,\n        combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen + rCorrection,\n        classPoints: rClassRaw + rPart - rPen + rCorrection,\n        hasResult: true,"
);

// (f) no-result return
patch(
  "no-result return correctionPoints",
  "          penaltyPoints: 0,\n          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,",
  "          penaltyPoints: 0,\n          correctionPoints: 0,\n          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,"
);

// (g) season totals
patch(
  "season totals + correction",
  "      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty,\n      classTotal: classRaw + participation - penalty,",
  "      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction,\n      classTotal: classRaw + participation - penalty + correction,"
);

if (changes > 0) fs.writeFileSync(FILE, s);
console.log(`  -> ${changes} change(s) written\n`);
EOF
node outputs-tmp/patch-standings.mjs

# ---------- Action ----------
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/race-results.ts";
let s = fs.readFileSync(FILE, "utf8");
let changes = 0;
function patch(label, before, after) {
  if (s.includes(after)) { console.log("  [skip] " + label); return; }
  if (!s.includes(before)) { console.error("  [MISS] " + label); return; }
  s = s.replace(before, after);
  changes++;
  console.log("  [ok  ] " + label);
}
console.log("race-results.ts:");

patch(
  "parse correctionPoints",
  "  const manualPenaltyPoints = parseInt(manualPenaltyPointsRaw, 10) || 0;",
  "  const manualPenaltyPoints = parseInt(manualPenaltyPointsRaw, 10) || 0;\n  const correctionPointsRaw = String(\n    formData.get(\"correctionPoints\") ?? \"0\"\n  );\n  const correctionPoints = parseInt(correctionPointsRaw, 10) || 0;"
);
patch(
  "include in data object",
  "    manualPenaltyPoints,\n    manualPenaltyReason,",
  "    manualPenaltyPoints,\n    correctionPoints,\n    manualPenaltyReason,"
);

if (changes > 0) fs.writeFileSync(FILE, s);
console.log(`  -> ${changes} change(s) written\n`);
EOF
node outputs-tmp/patch-action.mjs

# ---------- Admin round page ----------
cat > outputs-tmp/patch-admin.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
let changes = 0;
function patch(label, before, after) {
  if (s.includes(after)) { console.log("  [skip] " + label); return; }
  if (!s.includes(before)) { console.error("  [MISS] " + label); return; }
  s = s.replace(before, after);
  changes++;
  console.log("  [ok  ] " + label);
}
console.log("admin round page:");

patch(
  "row type correctionPoints",
  "      manualPenaltyPoints: number;\n      manualPenaltyReason: string | null;",
  "      manualPenaltyPoints: number;\n      correctionPoints: number;\n      manualPenaltyReason: string | null;"
);
patch(
  "header total includes correction",
  "      result.rawPointsAwarded +\n      result.participationPointsAwarded -\n      result.manualPenaltyPoints",
  "      result.rawPointsAwarded +\n      result.participationPointsAwarded -\n      result.manualPenaltyPoints +\n      result.correctionPoints"
);
patch(
  "Correction Field after Penalty pts",
  '        <Field\n          label="Penalty pts"\n          name="manualPenaltyPoints"\n          type="number"\n          defaultValue={String(result?.manualPenaltyPoints ?? 0)}\n          min={0}\n        />',
  '        <Field\n          label="Penalty pts"\n          name="manualPenaltyPoints"\n          type="number"\n          defaultValue={String(result?.manualPenaltyPoints ?? 0)}\n          min={0}\n        />\n        <Field\n          label="Correction"\n          name="correctionPoints"\n          type="number"\n          defaultValue={String(result?.correctionPoints ?? 0)}\n          placeholder="+/- adjust"\n        />'
);

if (changes > 0) fs.writeFileSync(FILE, s);
console.log(`  -> ${changes} change(s) written\n`);
EOF
node outputs-tmp/patch-admin.mjs

rm -rf outputs-tmp

echo ""
echo "=== git status now ==="
git status --short

echo ""
echo "If everything looks right, run:"
echo "  cd ~/Nextcloud/AI/league-manager"
echo "  git add prisma/schema.prisma src/lib/standings.ts src/lib/actions/race-results.ts 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'"
echo "  git commit -m 'Scoring: add correctionPoints (manual +/- adjustment, never dropped)'"
echo "  git push"
