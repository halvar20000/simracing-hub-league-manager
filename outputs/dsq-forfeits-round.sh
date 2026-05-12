#!/usr/bin/env bash
# DSQ in ANY race of a round forfeits the entire round for that driver:
# all of their RaceResults in the round get rawPointsAwarded=0 and
# participationPointsAwarded=0. Penalties and corrections are unaffected
# (they're admin-set and may apply on top).
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-scoring.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/scoring.ts";
let s = fs.readFileSync(FILE, "utf8");

// Insert a new helper recomputeDsqForfeitForRound and call it inside
// recomputeRoundScoring after participation has been computed.

// (a) Add the helper (right after recomputeParticipationForRound).
const helperAnchor =
  "async function recomputeParticipationForRound(\n  prisma: PrismaClient,\n  roundId: string\n): Promise<void>";
const helperFnEnd =
  "for (const list of byReg.values()) {";
// We add a new function after the existing one. Anchor on the closing
// of the function — find the next "}" after the participation function
// and insert before recomputeRoundFPR (which immediately follows).
const beforeFprAnchor = "/**\n * Recompute Fair Play Rating awards for a round";
const newHelper =
`/**
 * If a driver has a DSQ status on any RaceResult of a round, zero out their
 * race + participation points across ALL their RaceResults in that round
 * (round forfeit rule).
 */
async function recomputeDsqForfeitForRound(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const results = await prisma.raceResult.findMany({
    where: { roundId },
    select: {
      id: true,
      registrationId: true,
      finishStatus: true,
      rawPointsAwarded: true,
      participationPointsAwarded: true,
    },
  });
  const byReg = new Map<string, typeof results>();
  for (const r of results) {
    const list = byReg.get(r.registrationId) ?? [];
    list.push(r);
    byReg.set(r.registrationId, list);
  }
  for (const list of byReg.values()) {
    const dsq = list.some((r) => r.finishStatus === "DSQ");
    if (!dsq) continue;
    for (const r of list) {
      if (r.rawPointsAwarded !== 0 || r.participationPointsAwarded !== 0) {
        await prisma.raceResult.update({
          where: { id: r.id },
          data: { rawPointsAwarded: 0, participationPointsAwarded: 0 },
        });
      }
    }
  }
}

`;

if (s.includes("async function recomputeDsqForfeitForRound")) {
  console.log("scoring.ts: helper already present.");
} else {
  if (!s.includes(beforeFprAnchor)) {
    console.error("Anchor for FPR comment not found.");
    process.exit(1);
  }
  s = s.replace(beforeFprAnchor, newHelper + beforeFprAnchor);
  console.log("scoring.ts: added recomputeDsqForfeitForRound helper.");
}

// (b) Call it inside recomputeRoundScoring, after participation, before FPR.
const callBefore =
  "  await recomputeParticipationForRound(prisma, roundId);\n  await recomputeRoundFPR(prisma, roundId);";
const callAfter =
  "  await recomputeParticipationForRound(prisma, roundId);\n  await recomputeDsqForfeitForRound(prisma, roundId);\n  await recomputeRoundFPR(prisma, roundId);";
if (s.includes("recomputeDsqForfeitForRound(prisma, roundId)")) {
  console.log("scoring.ts: orchestrator already calls helper.");
} else {
  if (!s.includes(callBefore)) {
    console.error("Anchor in recomputeRoundScoring not found.");
    process.exit(1);
  }
  s = s.replace(callBefore, callAfter);
  console.log("scoring.ts: orchestrator now calls DSQ forfeit step.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-scoring.mjs
rm -rf outputs-tmp

# Recompute everything so DSQ forfeits propagate across all rounds
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
echo "=== Recompute all rounds ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Scoring: DSQ in any race of a round forfeits the whole round"
git push

echo ""
echo "Done. Kai Brendel's R3 SFL (DSQ in Race 2): both Race 1 + Race 2 now"
echo "have raw=0 and participation=0, so his round Total = 0 (only any"
echo "penalty/correction would still apply)."
