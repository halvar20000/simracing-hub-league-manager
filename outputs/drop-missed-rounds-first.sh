#!/usr/bin/env bash
# Drop-week rule: missed rounds (no participation) are dropped FIRST, then
# worst raced results. So we sort by (hasResult ASC, combinedPoints ASC)
# and slice the first N.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-drop-priority.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
`    // --- Drop worst N rounds (per ScoringSystem.dropWorstNRounds) ---
    const dropN = season?.scoringSystem.dropWorstNRounds ?? 0;
    if (dropN > 0) {
      const eligible = roundPoints.filter((rp) => rp.hasResult);
      if (eligible.length > dropN) {
        const sorted = [...eligible].sort(
          (a, b) => a.combinedPoints - b.combinedPoints
        );
        const droppedIds = new Set(
          sorted.slice(0, dropN).map((rp) => rp.roundId)
        );
        for (const rp of roundPoints) {
          if (droppedIds.has(rp.roundId)) {
            rp.dropped = true;
            raw -= rp.rawPoints;
            classRaw -= rp.classRawPoints;
            participation -= rp.participationPoints;
            // penalty stays — penalties always count, even when the round is dropped
          }
        }
      }
    }`;

const after =
`    // --- Drop worst N rounds (per ScoringSystem.dropWorstNRounds) ---
    // Priority: missed rounds (no result) first, then lowest combinedPoints.
    // Penalties are NEVER dropped — they always count.
    const dropN = season?.scoringSystem.dropWorstNRounds ?? 0;
    if (dropN > 0 && roundPoints.length > 0) {
      const sorted = [...roundPoints].sort((a, b) => {
        if (a.hasResult !== b.hasResult) {
          // false (no result) < true (has result), so missed rounds sort first
          return Number(a.hasResult) - Number(b.hasResult);
        }
        return a.combinedPoints - b.combinedPoints;
      });
      const droppedIds = new Set(
        sorted.slice(0, dropN).map((rp) => rp.roundId)
      );
      for (const rp of roundPoints) {
        if (droppedIds.has(rp.roundId)) {
          rp.dropped = true;
          if (rp.hasResult) {
            raw -= rp.rawPoints;
            classRaw -= rp.classRawPoints;
            participation -= rp.participationPoints;
            // penalty stays — penalties always count, even when the round is dropped
          }
          // Missed rounds contribute 0, so nothing to subtract.
        }
      }
    }`;

if (s.includes("Priority: missed rounds (no result) first")) {
  console.log("Drop priority already updated.");
} else if (!s.includes(before)) {
  console.error("Could not find existing drop block to replace.");
  console.error("If this fails repeatedly, paste me the current drop block and I'll fix the anchor.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Drop priority updated: missed rounds first, penalties always kept.");
}
EOF
node outputs-tmp/patch-drop-priority.mjs
rm -rf outputs-tmp

echo ""
echo "=== Recompute scoring on every round ==="
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
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Drop weeks: prioritise missed rounds, then worst raced result"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Juergen Raab in GT4 S3 should now have R4 (Donington Park) marked as dropped"
echo "    instead of R2."
echo "  - Drivers without missed rounds keep dropping their lowest-combined raced round."
echo "  - Penalties always count, even on dropped rounds."
