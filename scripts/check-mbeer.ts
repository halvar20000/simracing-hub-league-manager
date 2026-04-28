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
