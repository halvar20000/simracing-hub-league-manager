import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEAGUE_SLUG = "cas-gt3-wct";

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
  });
  if (!league) {
    console.error(`League "${LEAGUE_SLUG}" not found`);
    process.exit(1);
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season found in this league");
    process.exit(1);
  }

  console.log(
    `Cleaning data in season "${season.name} ${season.year}" (id ${season.id})\n`
  );

  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id },
    select: { id: true, name: true },
  });
  const roundIds = rounds.map((r) => r.id);
  console.log(`  ${rounds.length} round(s) preserved: ${rounds.map(r => r.name).join(", ")}`);

  // 1. FPR awards for these rounds
  const fpr = await prisma.fPRAward.deleteMany({
    where: { roundId: { in: roundIds } },
  });
  console.log(`  Deleted ${fpr.count} FPR awards`);

  // 2. CSV import audit records
  const csv = await prisma.csvImport.deleteMany({
    where: { roundId: { in: roundIds } },
  });
  console.log(`  Deleted ${csv.count} CSV import records`);

  // 3. Race results for the rounds
  const results = await prisma.raceResult.deleteMany({
    where: { roundId: { in: roundIds } },
  });
  console.log(`  Deleted ${results.count} race results`);

  // 4. Registrations in this season
  const regs = await prisma.registration.deleteMany({
    where: { seasonId: season.id },
  });
  console.log(`  Deleted ${regs.count} registrations`);

  // 5. Teams in this season
  const teams = await prisma.team.deleteMany({
    where: { seasonId: season.id },
  });
  console.log(`  Deleted ${teams.count} teams`);

  // 6. Car classes in this season
  const classes = await prisma.carClass.deleteMany({
    where: { seasonId: season.id },
  });
  console.log(`  Deleted ${classes.count} car classes`);

  // 7. Test users (with our test email pattern)
  const testUsers = await prisma.user.deleteMany({
    where: { email: { contains: "@test.simracing-hub.com" } },
  });
  console.log(`  Deleted ${testUsers.count} test users`);

  console.log(`\n✓ Cleanup complete.`);
  console.log(
    `Season "${season.name} ${season.year}" and its rounds remain ready for a fresh test.`
  );
  console.log(`\nNext steps:`);
  console.log(`  1. Attach the two new CSV files in chat.`);
  console.log(`  2. I'll generate a new registration script for the drivers in those CSVs.`);
  console.log(`  3. You run the new script, then upload the CSVs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
