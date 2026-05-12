#!/usr/bin/env bash
# Match iRLM: DNFs score position points (only DNS / DSQ are zeroed).
# Class re-ranking includes DNFs so per-class positions are correct.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) scoring.ts: relax calculateRawPoints
# ---------------------------------------------------------------
cat > outputs-tmp/patch-calc.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/scoring.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '  if (finishStatus !== "CLASSIFIED") return 0;\n  if (finishPosition < 1) return 0;\n  return pointsTable[String(finishPosition)] ?? 0;';
const after =
  '  // Only zero out drivers who never raced (DNS) or were disqualified.\n' +
  '  // DNF / Disconnected still scores based on their finish position —\n' +
  '  // matches iRLM behaviour.\n' +
  '  if (finishStatus === "DNS" || finishStatus === "DSQ") return 0;\n' +
  '  if (finishPosition < 1) return 0;\n' +
  '  return pointsTable[String(finishPosition)] ?? 0;';

if (s.includes("DNF / Disconnected still scores")) {
  console.log("scoring.ts: already updated.");
} else if (!s.includes(before)) {
  console.error("scoring.ts: anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("scoring.ts: calculateRawPoints relaxed (DNF scores; DNS/DSQ zero).");
}
EOF
node outputs-tmp/patch-calc.mjs

# ---------------------------------------------------------------
# 2) standings.ts: include non-DNS/DSQ in class re-ranking
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings-rerank.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '      const classified = round.raceResults\n' +
  '        .filter((r) => r.finishStatus === "CLASSIFIED")\n' +
  '        .sort((a, b) => a.finishPosition - b.finishPosition);';
const after =
  '      // Include DNFs (and any non-DNS/DSQ) in class re-ranking so they\n' +
  '      // get a class position — matches iRLM behaviour.\n' +
  '      const classified = round.raceResults\n' +
  '        .filter(\n' +
  '          (r) => r.finishStatus !== "DNS" && r.finishStatus !== "DSQ"\n' +
  '        )\n' +
  '        .sort((a, b) => a.finishPosition - b.finishPosition);';

if (s.includes("Include DNFs (and any non-DNS/DSQ)")) {
  console.log("standings.ts: class re-rank already updated.");
} else if (!s.includes(before)) {
  console.error("standings.ts: anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings.ts: class re-ranking now includes DNFs.");
}
EOF
node outputs-tmp/patch-standings-rerank.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 3) Recompute scoring across all rounds
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
echo "=== Recompute scoring ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Scoring: DNF earns position points; class re-rank includes non-DNS/DSQ"
git push

echo ""
echo "Done. After Vercel:"
echo "  - GT3 WCT 12 R4 (Spa) Robert Zellner AM standings: 3 points (matches iRLM)."
echo "  - Combined view (P30): still 0 because P30 isn't in the points table."
echo "  - Other DNFs across leagues get the same treatment — they now score"
echo "    based on their finish position. DSQ/DNS still score 0."
