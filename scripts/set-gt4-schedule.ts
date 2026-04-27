import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-tss-gt4" },
  });
  if (!league) {
    console.error("League cas-tss-gt4 not found");
    process.exit(1);
  }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season found in CAS TSS GT4");
    process.exit(1);
  }
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/cas-gt4-masters-season-4.png" },
  });
  console.log(`Schedule image set on ${season.name} ${season.year}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
