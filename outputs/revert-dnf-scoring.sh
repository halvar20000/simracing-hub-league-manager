#!/usr/bin/env bash
# Revert: keep our strict scoring rule (only CLASSIFIED earn position points).
# iRLM gets the wrong answer; ours is correct.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) scoring.ts: restore the CLASSIFIED check
# ---------------------------------------------------------------
cat > outputs-tmp/revert-calc.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/scoring.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '  // Only zero out drivers who never raced (DNS) or were disqualified.\n' +
  '  // DNF / Disconnected still scores based on their finish position —\n' +
  '  // matches iRLM behaviour.\n' +
  '  if (finishStatus === "DNS" || finishStatus === "DSQ") return 0;\n' +
  '  if (finishPosition < 1) return 0;\n' +
  '  return pointsTable[String(finishPosition)] ?? 0;';
const after =
  '  if (finishStatus !== "CLASSIFIED") return 0;\n' +
  '  if (finishPosition < 1) return 0;\n' +
  '  return pointsTable[String(finishPosition)] ?? 0;';

if (s.includes("if (finishStatus !== \"CLASSIFIED\") return 0;")) {
  console.log("scoring.ts: already reverted.");
} else if (!s.includes(before)) {
  console.error("scoring.ts: anchor not found, likely reverted differently.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("scoring.ts: restored CLASSIFIED-only rule.");
}
EOF
node outputs-tmp/revert-calc.mjs

# ---------------------------------------------------------------
# 2) standings.ts: restore class re-ranking to CLASSIFIED-only
# ---------------------------------------------------------------
cat > outputs-tmp/revert-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '      // Include DNFs (and any non-DNS/DSQ) in class re-ranking so they\n' +
  '      // get a class position — matches iRLM behaviour.\n' +
  '      const classified = round.raceResults\n' +
  '        .filter(\n' +
  '          (r) => r.finishStatus !== "DNS" && r.finishStatus !== "DSQ"\n' +
  '        )\n' +
  '        .sort((a, b) => a.finishPosition - b.finishPosition);';
const after =
  '      const classified = round.raceResults\n' +
  '        .filter((r) => r.finishStatus === "CLASSIFIED")\n' +
  '        .sort((a, b) => a.finishPosition - b.finishPosition);';

if (s.includes('.filter((r) => r.finishStatus === "CLASSIFIED")\n        .sort((a, b) => a.finishPosition - b.finishPosition);')) {
  console.log("standings.ts: already reverted.");
} else if (!s.includes(before)) {
  console.error("standings.ts: anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings.ts: restored CLASSIFIED-only class re-ranking.");
}
EOF
node outputs-tmp/revert-standings.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 3) Recompute (so DNF rows go back to 0 points)
# ---------------------------------------------------------------
mkdir -p scripts
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
echo "=== Recompute ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Revert DNF scoring change — only CLASSIFIED finishers earn position points"
git push

echo ""
echo "Done. Back to: only CLASSIFIED finishers earn position points."
