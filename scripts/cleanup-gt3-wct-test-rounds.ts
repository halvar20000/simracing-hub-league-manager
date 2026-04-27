import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-gt3-wct" },
  });
  if (!league) {
    console.error("League cas-gt3-wct not found.");
    process.exit(1);
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season in cas-gt3-wct.");
    process.exit(1);
  }

  console.log(`Working on season "${season.name} ${season.year}" (${season.id})\n`);

  // 1. Delete rounds 1 and 2 (cascades RaceResult, FPRAward, CsvImport, etc.)
  const deleted = await prisma.round.deleteMany({
    where: {
      seasonId: season.id,
      roundNumber: { in: [1, 2] },
    },
  });
  console.log(`Deleted ${deleted.count} test round(s).`);

  // 2. Renumber remaining rounds to start from 1
  const remaining = await prisma.round.findMany({
    where: { seasonId: season.id },
    orderBy: { roundNumber: "asc" },
  });

  for (let i = 0; i < remaining.length; i++) {
    const r = remaining[i];
    const target = i + 1;
    if (r.roundNumber !== target) {
      await prisma.round.update({
        where: { id: r.id },
        data: { roundNumber: target },
      });
    }
  }
  console.log(`Renumbered ${remaining.length} round(s) to 1–${remaining.length}.`);

  // 3. Rename the season
  const newName = "GT3 WCT 12th Season";
  await prisma.season.update({
    where: { id: season.id },
    data: { name: newName },
  });
  console.log(`Renamed season to "${newName}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
