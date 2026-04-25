/**
 * One-shot test-data script.
 *
 * Creates 11 test User + Registration rows (drivers extracted from the two
 * sample CSVs) in the most recent season of the CAS GT3 WCT league, plus
 * 3 test teams. All registrations are set to APPROVED.
 *
 * Run:
 *   npx tsx scripts/register-test-drivers.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEAGUE_SLUG = "cas-gt3-wct";

interface TestDriver {
  iracingId: string;
  firstName: string;
  lastName: string;
  startNumber: number | null;
  team: "A" | "B" | "C";
}

const drivers: TestDriver[] = [
  { iracingId: "633394",  firstName: "Mike",        lastName: "Zocher",       startNumber: 26,  team: "A" },
  { iracingId: "574387",  firstName: "Dennis Ulli", lastName: "Richter",      startNumber: 63,  team: "A" },
  { iracingId: "1021560", firstName: "Klaus",       lastName: "Oberlaender",  startNumber: 860, team: "A" },
  { iracingId: "634477",  firstName: "Antonio",     lastName: "Cursio",       startNumber: 555, team: "A" },
  { iracingId: "227997",  firstName: "Mike",        lastName: "Girenz",       startNumber: 33,  team: "B" },
  { iracingId: "646405",  firstName: "Justin",      lastName: "Christiansen", startNumber: 116, team: "B" },
  { iracingId: "974264",  firstName: "Andy",        lastName: "Weber",        startNumber: 5,   team: "B" },
  { iracingId: "384541",  firstName: "Benjamin",    lastName: "Warnow",       startNumber: 112, team: "B" },
  { iracingId: "1200858", firstName: "Lukas",       lastName: "Zörlaut",      startNumber: 89,  team: "C" },
  { iracingId: "841362",  firstName: "Bernhard",    lastName: "Wlach",        startNumber: 118, team: "C" },
  { iracingId: "439230",  firstName: "Alexander",   lastName: "Thieme2",      startNumber: 812, team: "C" },
];

const teamNames = {
  A: "Test Team A",
  B: "Test Team B",
  C: "Test Team C",
} as const;

async function main() {
  // Find the league
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
  });
  if (!league) {
    console.error(`League "${LEAGUE_SLUG}" not found.`);
    process.exit(1);
  }

  // Find the most recent season for the league
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error(
      `No season found for "${LEAGUE_SLUG}". Create one in admin first.`
    );
    process.exit(1);
  }
  console.log(`Using season: ${season.name} ${season.year} (id ${season.id})`);

  // Find an admin user to mark as approver
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.error("No admin user found — sign in once first.");
    process.exit(1);
  }

  // Create / reuse the 3 teams
  const teamRecords: Record<"A" | "B" | "C", string> = {
    A: "",
    B: "",
    C: "",
  };
  for (const key of ["A", "B", "C"] as const) {
    const name = teamNames[key];
    const team = await prisma.team.upsert({
      where: { seasonId_name: { seasonId: season.id, name } },
      update: {},
      create: { seasonId: season.id, name },
    });
    teamRecords[key] = team.id;
    console.log(`Team ${key}: ${name} (${team.id})`);
  }

  // Create users + registrations
  for (const d of drivers) {
    const email = `iracing-${d.iracingId}@test.simracing-hub.com`;

    const user = await prisma.user.upsert({
      where: { iracingMemberId: d.iracingId },
      update: {
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        name: `${d.firstName} ${d.lastName}`,
      },
      create: {
        iracingMemberId: d.iracingId,
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        name: `${d.firstName} ${d.lastName}`,
        role: "DRIVER",
      },
    });

    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
      update: {
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId: teamRecords[d.team],
        approvedById: admin.id,
        approvedAt: new Date(),
      },
      create: {
        seasonId: season.id,
        userId: user.id,
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId: teamRecords[d.team],
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });

    console.log(
      `  ${d.iracingId.padStart(7)}  ${d.firstName} ${d.lastName} → Team ${d.team}`
    );
  }

  console.log(
    `\nDone. ${drivers.length} test drivers registered in 3 teams.`
  );
  console.log(
    `Now upload the two CSVs:`
  );
  console.log(
    `  Round 1 (Summit Point) → eventresult_84768412_0.csv`
  );
  console.log(
    `  Round 2 (Mugello) → eventresult_85122537_0.csv`
  );
  console.log(
    `\nThen visit /leagues/${LEAGUE_SLUG}/seasons/${season.id}/standings`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
