import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";

async function main() {
  const ss = await prisma.scoringSystem.findUnique({ where: { name: "CAS PCCD" } });
  if (!ss) throw new Error("CAS PCCD not found");
  const r1 = ss.pointsTable;
  console.log("Current R1 points (will be copied to R2):");
  console.log(" ", r1);
  await prisma.scoringSystem.update({
    where: { id: ss.id },
    data: { pointsTableRace2: r1 },
  });
  console.log("Updated CAS PCCD: pointsTableRace2 now equals pointsTable.");

  // Recompute scoring for every PCCD round with results
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: ss.id },
    select: { id: true, name: true },
  });
  for (const s of seasons) {
    const rounds = await prisma.round.findMany({
      where: { seasonId: s.id, raceResults: { some: {} } },
      select: { id: true, roundNumber: true },
      orderBy: { roundNumber: "asc" },
    });
    for (const r of rounds) {
      await recomputeRoundScoring(prisma, r.id);
      console.log(`Recomputed ${s.name} R${r.roundNumber}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
