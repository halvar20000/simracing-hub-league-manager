#!/usr/bin/env bash
# Find where per-round 'total' is computed for the race-by-race view, and
# verify whether participation points are included.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/lib/standings.ts: imports + types + relevant total math ==="
echo ""
echo "--- Lines mentioning combinedPoints / classPoints / participation ---"
grep -n 'combinedPoints\|classPoints\|participationPoints\|participation' src/lib/standings.ts | head -40

echo ""
echo "--- The full RoundPoints assembly section (around participation) ---"
grep -n 'roundPoints\|RoundPoints' src/lib/standings.ts | head -10

echo ""
echo "--- Show 50 lines around the first 'combinedPoints' assignment ---"
LINE=$(grep -n 'combinedPoints[[:space:]]*[:=]' src/lib/standings.ts | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE > 25 ? LINE - 25 : 1))
  END=$((LINE + 25))
  echo "(lines $START-$END)"
  sed -n "${START},${END}p" src/lib/standings.ts
fi

echo ""
echo "=== Diagnostic: check Matthias Beer's actual RaceResult ==="
mkdir -p scripts
cat > scripts/check-mbeer.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { firstName: { startsWith: "Matthias" }, lastName: "Beer" },
  });
  if (!user) { console.log("Matthias Beer not found"); return; }
  console.log("User:", user.id, user.firstName, user.lastName, "iRacingId=" + user.iracingMemberId);

  const regs = await prisma.registration.findMany({
    where: { userId: user.id },
    include: { season: { include: { league: true, scoringSystem: true } } },
  });
  console.log("\nRegistrations:");
  for (const r of regs) {
    console.log(" ", r.id, r.season.league.slug, r.season.name,
      "scoring=" + r.season.scoringSystem.name,
      "participationPts=" + r.season.scoringSystem.participationPoints,
      "minPct=" + r.season.scoringSystem.participationMinDistancePct);
  }

  const rrs = await prisma.raceResult.findMany({
    where: { registration: { userId: user.id } },
    include: { round: { select: { roundNumber: true, name: true, seasonId: true } } },
    orderBy: { round: { roundNumber: "asc" } },
  });
  console.log("\nRaceResults:");
  for (const rr of rrs) {
    console.log("  R" + rr.round.roundNumber, rr.round.name,
      "raw=" + rr.rawPointsAwarded,
      "part=" + rr.participationPointsAwarded,
      "manualPen=" + rr.manualPenaltyPoints,
      "distance=" + rr.raceDistancePct + "%",
      "status=" + rr.finishStatus);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/check-mbeer.ts
