import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEAGUE_SLUG = "cas-gt3-wct";

interface Driver {
  iracingId: string;
  fullName: string;
  proAm: "PRO" | "AM";
  team: string | null;
  startNumber: number;
}

// Sourced from "Anmeldung WCT Season 12 (Antworten)".
// Team names normalized to a single canonical spelling per team.
const drivers: Driver[] = [
  { iracingId: "384541",  fullName: "Benjamin Warnow",        proAm: "AM",  team: "Neon Simsports Yellow",         startNumber: 112 },
  { iracingId: "388458",  fullName: "Hendrik Stanzel",        proAm: "PRO", team: "Neon Simsports Yellow",         startNumber: 45 },
  { iracingId: "731013",  fullName: "Julian Borowski",        proAm: "PRO", team: null,                            startNumber: 91 },
  { iracingId: "1057110", fullName: "Ralph Mielke",           proAm: "AM",  team: "CAS Tech Performance Red",      startNumber: 967 },
  { iracingId: "479423",  fullName: "Thomas Kuebler",         proAm: "PRO", team: "CAS Tech Performance Red",      startNumber: 73 },
  { iracingId: "956612",  fullName: "Patrick Schleuthner",    proAm: "AM",  team: "Neon Simsports Green",          startNumber: 176 },
  { iracingId: "1231097", fullName: "Djavit Segashi",         proAm: "AM",  team: "Neon Simsports Green",          startNumber: 181 },
  { iracingId: "158597",  fullName: "Michael Endres",         proAm: "AM",  team: "GTunit",                        startNumber: 98 },
  { iracingId: "1140676", fullName: "Max Coldron",            proAm: "AM",  team: "Neon Simsports Red",            startNumber: 334 },
  { iracingId: "646405",  fullName: "Justin Christiansen",    proAm: "AM",  team: "Neon Simsports Blue",           startNumber: 116 },
  { iracingId: "812582",  fullName: "Carl Sören Schober",     proAm: "PRO", team: "Prime eRacing",                 startNumber: 680 },
  { iracingId: "891101",  fullName: "Michael Gessner",        proAm: "PRO", team: "VR46 Racing",                   startNumber: 46 },
  { iracingId: "770518",  fullName: "Fritz Morawetz",         proAm: "AM",  team: "Neon Simsports Red",            startNumber: 626 },
  { iracingId: "974264",  fullName: "Andy Weber",             proAm: "PRO", team: "DanKüchen Motorsport Team AUT", startNumber: 5 },
  { iracingId: "844831",  fullName: "Maurice Becker",         proAm: "PRO", team: "M&J Downforce",                 startNumber: 49 },
  { iracingId: "1118486", fullName: "Manfred Baar",           proAm: "AM",  team: "DanKüchen Motorsport Team AUT", startNumber: 581 },
  { iracingId: "841362",  fullName: "Bernhard Wlach",         proAm: "AM",  team: "DanKüchen Motorsport Team AUT", startNumber: 118 },
  { iracingId: "1021560", fullName: "Klaus Oberlaender",      proAm: "AM",  team: "DanKüchen Motorsport Team GER", startNumber: 860 },
  { iracingId: "574387",  fullName: "Dennis Ulli Richter",    proAm: "PRO", team: "Speed Monkeys",                 startNumber: 63 },
  { iracingId: "439230",  fullName: "Alexander Thieme2",      proAm: "AM",  team: "DanKüchen Motorsport Team GER", startNumber: 812 },
  { iracingId: "227997",  fullName: "Mike Girenz",            proAm: "PRO", team: "FRAMIDI Racing",                startNumber: 33 },
  { iracingId: "1135701", fullName: "Danny Platzer",          proAm: "AM",  team: "DanKüchen Motorsport Team GER", startNumber: 244 },
  { iracingId: "1124831", fullName: "Benjamin Schlosser",     proAm: "PRO", team: "CBS Racing Team",               startNumber: 83 },
  { iracingId: "894097",  fullName: "Christoph Kiesel",       proAm: "AM",  team: "WS Racing eSports e.V.",        startNumber: 146 },
  { iracingId: "1189750", fullName: "Samuel Krzykowski",      proAm: "AM",  team: "Neon Simsports Blue",           startNumber: 330 },
  { iracingId: "1180816", fullName: "Gregor Micewski",        proAm: "PRO", team: "TeamSpirit-Simracing",          startNumber: 8 },
  { iracingId: "1200858", fullName: "Lukas Zörlaut",          proAm: "PRO", team: "Neon Simsports Blue",           startNumber: 89 },
  { iracingId: "616923",  fullName: "Dirk Bolte",             proAm: "AM",  team: "FRAMIDI Racing",                startNumber: 134 },
  { iracingId: "645893",  fullName: "Björn Butze",            proAm: "AM",  team: "CAS Tech Performance Black",    startNumber: 666 },
  { iracingId: "841198",  fullName: "Celine-Denise Brese",    proAm: "AM",  team: "TeamSpirit-Simracing",          startNumber: 438 },
  { iracingId: "861718",  fullName: "Yannick Wonnenberg",     proAm: "PRO", team: "Speed Monkeys",                 startNumber: 2 },
  { iracingId: "634477",  fullName: "Antonio Cursio",         proAm: "AM",  team: "CAS Tech Performance Black",    startNumber: 555 },
  { iracingId: "698837",  fullName: "Chistian Schlosser",     proAm: "AM",  team: "CBS Racing Team",               startNumber: 674 },
  { iracingId: "407036",  fullName: "Hubert Diethard",        proAm: "PRO", team: "DanKüchen Motorsport",          startNumber: 77 },
  { iracingId: "912856",  fullName: "Thomas Herbrig",         proAm: "AM",  team: "CAS Tech Performance Black",    startNumber: 968 },
  { iracingId: "1057822", fullName: "Robert Zellner",         proAm: "AM",  team: "TeamSpirit-Simracing",          startNumber: 360 },
  { iracingId: "1158328", fullName: "Luca-Maximilian Stein",  proAm: "PRO", team: "Nova Nitro Motorsport",         startNumber: 35 },
  { iracingId: "633394",  fullName: "Mike Zocher",            proAm: "PRO", team: "Speed Monkeys",                 startNumber: 26 },
  { iracingId: "1218224", fullName: "Leon Klein",             proAm: "PRO", team: "TeamSpirit-Simracing",          startNumber: 66 },
  { iracingId: "1174590", fullName: "Michael Krieger",        proAm: "AM",  team: "Hafeneger Motorsport",          startNumber: 479 },
  { iracingId: "1051932", fullName: "Marius Becker",          proAm: "PRO", team: "Speed Monkeys",                 startNumber: 14 },
  { iracingId: "1378586", fullName: "Holger Meißner",         proAm: "AM",  team: null,                            startNumber: 232 },
  { iracingId: "1030766", fullName: "Wohl Joe",               proAm: "AM",  team: "NX Motorsport",                 startNumber: 148 },
  { iracingId: "1107733", fullName: "Mario Severn",           proAm: "PRO", team: "Dat muss Kesseln",              startNumber: 69 },
  { iracingId: "544198",  fullName: "Florian Eigner",         proAm: "PRO", team: "Team Phase 2",                  startNumber: 34 },
];

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
  });
  if (!league) {
    console.error(`League "${LEAGUE_SLUG}" not found.`);
    process.exit(1);
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season in CAS GT3 WCT — create one first.");
    process.exit(1);
  }

  // Make sure Pro/Am is enabled on the season
  if (!season.proAmEnabled) {
    await prisma.season.update({
      where: { id: season.id },
      data: { proAmEnabled: true },
    });
    console.log(`Enabled Pro/Am on ${season.name} ${season.year}`);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });
  if (!admin) {
    console.error("No admin user found.");
    process.exit(1);
  }

  console.log(`Registering ${drivers.length} drivers in ${season.name} ${season.year}\n`);

  // Pre-create teams (deduped by lowercase)
  const teamCache = new Map<string, string>(); // canonical name → team.id
  for (const d of drivers) {
    if (!d.team) continue;
    const key = d.team;
    if (teamCache.has(key)) continue;
    const team = await prisma.team.upsert({
      where: { seasonId_name: { seasonId: season.id, name: key } },
      update: {},
      create: { seasonId: season.id, name: key },
    });
    teamCache.set(key, team.id);
  }
  console.log(`Ensured ${teamCache.size} team(s).`);

  // Process drivers
  let createdUsers = 0;
  let createdRegs = 0;
  let updatedRegs = 0;

  for (const d of drivers) {
    const { firstName, lastName } = splitName(d.fullName);
    const email = `iracing-${d.iracingId}@imported.simracing-hub.com`;

    const userExists = await prisma.user.findUnique({
      where: { iracingMemberId: d.iracingId },
    });
    if (!userExists) createdUsers++;

    const user = await prisma.user.upsert({
      where: { iracingMemberId: d.iracingId },
      update: {
        firstName,
        lastName,
        name: d.fullName,
      },
      create: {
        iracingMemberId: d.iracingId,
        firstName,
        lastName,
        email,
        name: d.fullName,
        role: "DRIVER",
      },
    });

    const teamId = d.team ? teamCache.get(d.team) ?? null : null;

    const existing = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (existing) updatedRegs++;
    else createdRegs++;

    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
      update: {
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId,
        proAmClass: d.proAm,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
      create: {
        seasonId: season.id,
        userId: user.id,
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId,
        proAmClass: d.proAm,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });

    console.log(
      `  ${d.iracingId.padStart(7)}  #${String(d.startNumber).padStart(3)}  ${d.proAm.padEnd(3)}  ${d.fullName.padEnd(28)}  ${d.team ?? "(no team)"}`
    );
  }

  console.log(`\nDone:`);
  console.log(`  Drivers processed: ${drivers.length}`);
  console.log(`  New user accounts: ${createdUsers}`);
  console.log(`  New registrations: ${createdRegs}`);
  console.log(`  Updated registrations: ${updatedRegs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
