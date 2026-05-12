#!/usr/bin/env bash
# Per-scoring-system flag: participationInCombined (default true).
#  - GT3 WCT: false (combined = race - penalty only)
#  - GT4 Masters / SFL: true (combined = race + participation - penalty)
# Class view always includes participation. Team scoring unchanged.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------
# 1) Schema: add participationInCombined to ScoringSystem
# ---------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
const start = s.indexOf("model ScoringSystem {");
if (start < 0) { console.error("ScoringSystem model not found"); process.exit(1); }
const end = s.indexOf("}", start);
const block = s.slice(start, end);
if (/participationInCombined/.test(block)) {
  console.log("Field already present.");
} else {
  // Insert just before the closing brace of the model
  const insert = "  participationInCombined Boolean   @default(true)\n";
  s = s.slice(0, end) + insert + s.slice(end);
  fs.writeFileSync(FILE, s);
  console.log("Added participationInCombined to ScoringSystem.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

# ---------------------------------------------------------------
# 2) Set false for GT3 WCT scoring system
# ---------------------------------------------------------------
mkdir -p scripts
cat > scripts/configure-participation-combined.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const CONFIG: { name: string; flag: boolean }[] = [
  { name: "CAS GT3 WCT",     flag: false }, // combined = race only (no participation)
  // Defaults (true) cover GT4 Masters, SFL Cup, IEC, PCCD, ...
];

async function main() {
  for (const c of CONFIG) {
    const ss = await prisma.scoringSystem.findUnique({ where: { name: c.name } });
    if (!ss) { console.log(`(skip) ${c.name} not found`); continue; }
    if (ss.participationInCombined === c.flag) {
      console.log(`${c.name}: already ${c.flag}`);
      continue;
    }
    await prisma.scoringSystem.update({
      where: { id: ss.id },
      data: { participationInCombined: c.flag },
    });
    console.log(`${c.name}: participationInCombined ${ss.participationInCombined} -> ${c.flag}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
echo ""
echo "=== Configure participationInCombined for GT3 WCT ==="
npx tsx scripts/configure-participation-combined.ts

# ---------------------------------------------------------------
# 3) Patch standings.ts: respect the flag for combined only
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Per-round combinedPoints
const beforeA = "combinedPoints: rRaw + rPart - rPen,";
const afterA = "combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen,";
if (!s.includes(afterA)) {
  if (!s.includes(beforeA)) { console.error("Anchor A missing"); process.exit(1); }
  s = s.replace(beforeA, afterA);
  console.log("Patched per-round combinedPoints.");
}

// (b) Per-season combinedTotal
const beforeB = "combinedTotal: raw + participation - penalty,";
const afterB  = "combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty,";
if (!s.includes(afterB)) {
  if (!s.includes(beforeB)) { console.error("Anchor B missing"); process.exit(1); }
  s = s.replace(beforeB, afterB);
  console.log("Patched per-season combinedTotal.");
}

// (c) Define `includeParticipationInCombined` once, near the start of the
//     per-driver map. We anchor on the existing `let raw = 0;` line and
//     declare the flag immediately after.
const beforeC =
  "  const standings: DriverStanding[] = registrations.map((reg) => {\n    let raw = 0;";
const afterC =
  "  const includeParticipationInCombined =\n    season?.scoringSystem.participationInCombined ?? true;\n  const standings: DriverStanding[] = registrations.map((reg) => {\n    let raw = 0;";
if (!s.includes("const includeParticipationInCombined")) {
  if (!s.includes(beforeC)) { console.error("Anchor C missing"); process.exit(1); }
  s = s.replace(beforeC, afterC);
  console.log("Declared includeParticipationInCombined.");
}

fs.writeFileSync(FILE, s);
EOF
echo ""
echo "=== Patch standings.ts ==="
node outputs-tmp/patch-standings.mjs

# ---------------------------------------------------------------
# 4) Patch the comment in RoundPoints interface
# ---------------------------------------------------------------
cat > outputs-tmp/patch-comment.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = "combinedPoints: number;     // = rawPoints + participation - penalty";
const after  = "combinedPoints: number;     // = rawPoints + (participation if enabled) - penalty";
if (s.includes(before)) { s = s.replace(before, after); fs.writeFileSync(FILE, s); console.log("Updated comment."); }
else console.log("Comment already updated.");
EOF
node outputs-tmp/patch-comment.mjs

# ---------------------------------------------------------------
# 5) Add the toggle to the scoring-system edit page + read it in the action
# ---------------------------------------------------------------
cat > outputs-tmp/patch-edit-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Insert a checkbox row at the bottom of the Participation section.
const before =
  '            <Field\n              label="Min distance % to qualify for participation pts"\n              name="participationMinDistancePct"\n              type="number"\n              defaultValue={String(ss.participationMinDistancePct)}\n              min={0}\n              max={100}\n            />\n          </div>\n        </Section>';
const after =
  '            <Field\n              label="Min distance % to qualify for participation pts"\n              name="participationMinDistancePct"\n              type="number"\n              defaultValue={String(ss.participationMinDistancePct)}\n              min={0}\n              max={100}\n            />\n          </div>\n          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-200">\n            <input\n              type="checkbox"\n              name="participationInCombined"\n              defaultChecked={ss.participationInCombined}\n              className="h-4 w-4"\n            />\n            Include participation points in <strong>combined</strong> standings\n            <span className="ml-2 text-xs text-zinc-500">\n              (Class and Team scoring always include participation)\n            </span>\n          </label>\n        </Section>';

if (s.includes('name="participationInCombined"')) {
  console.log("Edit page: checkbox already present.");
} else if (!s.includes(before)) {
  console.error("Edit page anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Edit page: added participation-in-combined checkbox.");
}
EOF
node outputs-tmp/patch-edit-page.mjs

cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Read participationInCombined from form
const beforeA = "  const dropWorstNRounds = readIntOrNull(formData.get(\"dropWorstNRounds\"));";
const afterA  = beforeA + "\n  const participationInCombined = formData.get(\"participationInCombined\") === \"on\";";
if (!s.includes("participationInCombined =")) {
  if (!s.includes(beforeA)) { console.error("Action A anchor missing"); process.exit(1); }
  s = s.replace(beforeA, afterA);
  console.log("Action: read participationInCombined.");
}

// (b) Add to the update payload right after dropWorstNRounds
const beforeB = "      dropWorstNRounds,\n    },\n  });";
const afterB  = "      dropWorstNRounds,\n      participationInCombined,\n    },\n  });";
if (!s.includes("participationInCombined,")) {
  if (!s.includes(beforeB)) { console.error("Action B anchor missing"); process.exit(1); }
  s = s.replace(beforeB, afterB);
  console.log("Action: persist participationInCombined.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-action.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 6) Recompute scoring across all rounds
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
echo "=== Recompute scoring on all rounds ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Scoring: add participationInCombined flag, set GT3 WCT to false"
git push

echo ""
echo "Done. After Vercel:"
echo "  - GT3 WCT 12 standings (Combined view): participation no longer adds to total."
echo "  - GT4 / SFL standings (Combined view): participation still adds (default true)."
echo "  - Pro/Am / Class standings: always include participation (unchanged)."
echo "  - Team standings: unchanged (still benefits from participation)."
echo "  - You can toggle the rule per system at /admin/scoring-systems/<id>/edit."
