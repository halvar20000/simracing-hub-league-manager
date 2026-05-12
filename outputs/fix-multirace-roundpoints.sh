#!/usr/bin/env bash
# Fix the per-round roundPoints construction in standings.ts to aggregate
# across ALL raceResults for that (round, registration) — not just one.
# This fixes the multi-race bug where R1's participation gets overwritten
# by R2's in the per-round breakdown.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) resultsByRoundId — change from Map<string, RaceResult> to Map<string, RaceResult[]>
const before1 =
`    const resultsByRoundId = new Map(
      reg.raceResults.map((r) => [r.roundId, r])
    );
    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const result = resultsByRoundId.get(round.id);
      if (!result) {`;
const after1 =
`    const resultsByRoundId = new Map<string, typeof reg.raceResults>();
    for (const r of reg.raceResults) {
      const list = resultsByRoundId.get(r.roundId) ?? [];
      list.push(r);
      resultsByRoundId.set(r.roundId, list);
    }
    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const results = resultsByRoundId.get(round.id) ?? [];
      if (results.length === 0) {`;

if (s.includes("typeof reg.raceResults>();")) {
  console.log("(a) resultsByRoundId already a list — skipping.");
} else if (!s.includes(before1)) {
  console.error("(a) anchor not found");
  process.exit(1);
} else {
  s = s.replace(before1, after1);
  console.log("(a) resultsByRoundId switched to list, result -> results.");
}

// (b) Body: result.X -> results.reduce(...) and class re-rank loop over results
const before2 =
`      const rRaw = result.rawPointsAwarded;
      const rPart = result.participationPointsAwarded;
      const rPen = result.manualPenaltyPoints;
      const rCorrection = result.correctionPoints;
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        const classPos = classPositionByResult.get(result.id);
        if (classPos != null) {
          rClassRaw = pointsTable[String(classPos)] ?? 0;
        }
      }`;
const after2 =
`      const rRaw = results.reduce((sum, r) => sum + r.rawPointsAwarded, 0);
      const rPart = results.reduce(
        (sum, r) => sum + r.participationPointsAwarded,
        0
      );
      const rPen = results.reduce((sum, r) => sum + r.manualPenaltyPoints, 0);
      const rCorrection = results.reduce(
        (sum, r) => sum + r.correctionPoints,
        0
      );
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        rClassRaw = 0;
        for (const r of results) {
          const classPos = classPositionByResult.get(r.id);
          if (classPos != null) {
            rClassRaw += pointsTable[String(classPos)] ?? 0;
          } else {
            rClassRaw += r.rawPointsAwarded;
          }
        }
      }`;

if (s.includes("results.reduce((sum, r) => sum + r.rawPointsAwarded")) {
  console.log("(b) body already aggregates — skipping.");
} else if (!s.includes(before2)) {
  console.error("(b) anchor not found");
  process.exit(1);
} else {
  s = s.replace(before2, after2);
  console.log("(b) body now sums race/part/pen/correction across all races.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

# Recompute scoring everywhere so cached display values refresh
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
echo "=== Recompute scoring (data unchanged, just refreshes any cached aggregates) ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Standings: aggregate per-round roundPoints across all RaceResults (multi-race)"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Multi-race rounds (PCCD S4, SFL S7) per-round Total/R/B/P columns now"
echo "    sum correctly across both races; participation appears under Bonus."
echo "  - Single-race seasons unchanged (each round still has 1 RaceResult)."
