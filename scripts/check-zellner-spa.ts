import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) { console.log("league not found"); return; }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
    include: { scoringSystem: true },
  });
  if (!season) { console.log("season not found"); return; }
  console.log(
    "Season:", season.name,
    "scoring=" + season.scoringSystem.name,
    "participationPoints=" + season.scoringSystem.participationPoints,
    "minPct=" + season.scoringSystem.participationMinDistancePct
  );

  const user = await prisma.user.findFirst({
    where: { lastName: "Zellner", firstName: { startsWith: "Robert" } },
  });
  if (!user) { console.log("Robert Zellner user not found"); return; }
  console.log("User:", user.id, user.firstName, user.lastName, "iRacingId=" + user.iracingMemberId);

  // Find Spa round
  const spa = await prisma.round.findFirst({
    where: {
      seasonId: season.id,
      OR: [
        { name: { contains: "Spa", mode: "insensitive" } },
        { track: { contains: "Spa", mode: "insensitive" } },
      ],
    },
  });
  if (!spa) { console.log("Spa round not found"); return; }
  console.log("Round:", spa.roundNumber, spa.name, spa.track);

  // Find Robert's RaceResult for Spa
  const rrs = await prisma.raceResult.findMany({
    where: {
      roundId: spa.id,
      registration: { userId: user.id },
    },
    include: { registration: { include: { user: true } } },
  });
  if (rrs.length === 0) {
    console.log("No RaceResult for Robert at Spa");
    return;
  }
  for (const rr of rrs) {
    console.log("\nRaceResult:", rr.id);
    console.log("  raceNumber       =", rr.raceNumber);
    console.log("  finishStatus     =", rr.finishStatus);
    console.log("  finishPosition   =", rr.finishPosition);
    console.log("  startPosition    =", rr.startPosition);
    console.log("  lapsCompleted    =", rr.lapsCompleted);
    console.log("  raceDistancePct  =", rr.raceDistancePct + "%");
    console.log("  incidents        =", rr.incidents);
    console.log("  rawPointsAwarded =", rr.rawPointsAwarded);
    console.log("  participationPts =", rr.participationPointsAwarded);
    console.log("  manualPenaltyPts =", rr.manualPenaltyPoints);
    console.log("  bestLapTimeMs    =", rr.bestLapTimeMs);
    console.log("  totalTimeMs      =", rr.totalTimeMs);
  }

  // Show the points table for the season's scoring system at Robert's finish
  const ss = season.scoringSystem;
  const tbl = (ss.pointsTable as Record<string, number>) ?? {};
  console.log("\nScoring system points table (selected):");
  for (let p = 1; p <= 30; p++) {
    if (tbl[String(p)] != null) {
      console.log(`  P${p}: ${tbl[String(p)]}`);
    }
  }
  console.log(`  participationMinDistancePct: ${ss.participationMinDistancePct}%`);
  console.log(`  participationPoints: ${ss.participationPoints}`);

  // For comparison, show how many laps the leader completed
  const leader = await prisma.raceResult.findFirst({
    where: { roundId: spa.id, raceNumber: rrs[0]?.raceNumber ?? 1, finishPosition: 1 },
    select: { lapsCompleted: true },
  });
  console.log("\nLeader lapsCompleted:", leader?.lapsCompleted ?? "?");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
