import { prisma } from "@/lib/prisma";

async function main() {
  // Find PCCD scoring system + show points tables
  const ss = await prisma.scoringSystem.findUnique({ where: { name: "CAS PCCD" } });
  if (!ss) { console.log("CAS PCCD scoring not found"); return; }
  console.log("CAS PCCD scoring system:");
  console.log("  participationPoints =", ss.participationPoints);
  console.log("  participationMinPct =", ss.participationMinDistancePct);
  console.log("  racePointsMinPct    =", ss.racePointsMinDistancePct);
  console.log("  racesPerRound       =", ss.racesPerRound);
  console.log("  pointsTable (R1):");
  const t1 = (ss.pointsTable as Record<string, number>) ?? {};
  for (let p = 1; p <= 20; p++) if (t1[String(p)] != null) console.log(`    P${p}: ${t1[String(p)]}`);
  console.log("  pointsTableRace2 (R2):");
  const t2 = (ss.pointsTableRace2 as Record<string, number>) ?? {};
  for (let p = 1; p <= 20; p++) if (t2[String(p)] != null) console.log(`    P${p}: ${t2[String(p)]}`);

  // Find Silvio Foth's RaceResults at Watkins Glen
  const user = await prisma.user.findFirst({
    where: { lastName: "Foth", firstName: { startsWith: "Silvio" } },
  });
  if (!user) { console.log("\nSilvio Foth not found"); return; }
  console.log("\nUser:", user.id, user.firstName, user.lastName);

  const watkins = await prisma.round.findFirst({
    where: {
      OR: [
        { name: { contains: "Watkins", mode: "insensitive" } },
        { track: { contains: "Watkins", mode: "insensitive" } },
      ],
      season: { league: { slug: "cas-pccd" } },
    },
    include: { season: { select: { name: true } } },
  });
  if (!watkins) { console.log("Watkins Glen round in PCCD not found"); return; }
  console.log("Round:", watkins.roundNumber, watkins.name, "(season:", watkins.season.name + ")");

  const rrs = await prisma.raceResult.findMany({
    where: { roundId: watkins.id, registration: { userId: user.id } },
    orderBy: { raceNumber: "asc" },
  });
  console.log("\nRaceResults:");
  for (const r of rrs) {
    console.log(
      `  Race ${r.raceNumber}: pos=${r.finishPosition} status=${r.finishStatus} dist=${r.raceDistancePct}%` +
        ` raw=${r.rawPointsAwarded} part=${r.participationPointsAwarded}` +
        ` pen=${r.manualPenaltyPoints} corr=${r.correctionPoints}`
    );
  }
  const total = rrs.reduce(
    (s, r) =>
      s +
      r.rawPointsAwarded +
      r.participationPointsAwarded -
      r.manualPenaltyPoints +
      r.correctionPoints,
    0
  );
  console.log("Total round contribution:", total);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
