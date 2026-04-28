import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  if (!league) { console.log("league not found"); return; }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) { console.log("season not found"); return; }
  const r1 = await prisma.round.findFirst({
    where: { seasonId: season.id, roundNumber: 1 },
  });
  if (!r1) { console.log("R1 not found"); return; }

  const winner = await prisma.raceResult.findFirst({
    where: { roundId: r1.id, raceNumber: 1, finishPosition: 1 },
    include: { registration: { include: { user: true } } },
  });
  if (!winner) {
    console.log("no R1 race-1 winner found — has the re-pull run for R1?");
    return;
  }
  const driver = `${winner.registration.user.firstName} ${winner.registration.user.lastName}`;
  console.log("R1 race-1 winner:", driver);

  const sameDriver = await prisma.raceResult.findMany({
    where: { roundId: r1.id, registrationId: winner.registrationId },
    orderBy: { raceNumber: "asc" },
  });
  console.log("");
  console.log("All R1 results for", driver + ":");
  for (const r of sameDriver) {
    console.log(
      `  Race ${r.raceNumber}: pos=${r.finishPosition} ` +
      `raw=${r.rawPointsAwarded} part=${r.participationPointsAwarded} ` +
      `pen=${r.manualPenaltyPoints}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
