import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Disable FPR on every scoring system except CAS IEC
  const updated = await prisma.scoringSystem.updateMany({
    where: { name: { not: "CAS IEC" } },
    data: { fprEnabled: false },
  });
  console.log(`Disabled FPR on ${updated.count} scoring system(s).`);

  // Wipe FPR awards belonging to rounds whose season uses a non-FPR scoring system
  const nonIecScoring = await prisma.scoringSystem.findMany({
    where: { fprEnabled: false },
    select: { id: true },
  });
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: { in: nonIecScoring.map((s) => s.id) } },
    select: { id: true },
  });
  const rounds = await prisma.round.findMany({
    where: { seasonId: { in: seasons.map((s) => s.id) } },
    select: { id: true },
  });
  const wiped = await prisma.fPRAward.deleteMany({
    where: { roundId: { in: rounds.map((r) => r.id) } },
  });
  console.log(`Deleted ${wiped.count} stale FPR award(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
