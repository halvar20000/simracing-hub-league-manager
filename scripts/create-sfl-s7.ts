import { prisma } from "@/lib/prisma";
import type { RegistrationStatus, RoundStatus } from "@prisma/client";

// ---------- Schedule ----------
type RoundDef = {
  num: number;
  name: string;
  track: string;
  trackConfig: string | null;
  startsAtIso: string; // UTC: 19:00 CET (Feb-Mar pre-DST) -> 18:00 UTC
                       //      19:00 CEST (Apr+, post-DST 29.03) -> 17:00 UTC
};
const ROUNDS: RoundDef[] = [
  { num: 1, name: "Red Bull Ring",            track: "Red Bull Ring",           trackConfig: "GP",  startsAtIso: "2026-02-18T18:00:00.000Z" },
  { num: 2, name: "Circuit de Barcelona",     track: "Barcelona",               trackConfig: "GP",  startsAtIso: "2026-03-04T18:00:00.000Z" },
  { num: 3, name: "Circuit of the Americas",  track: "Circuit of the Americas", trackConfig: "GP",  startsAtIso: "2026-03-18T18:00:00.000Z" },
  // CEST starts 2026-03-29; rounds from here at 17:00 UTC
  { num: 4, name: "Imola",                    track: "Imola",                   trackConfig: "GP",  startsAtIso: "2026-04-01T17:00:00.000Z" },
  { num: 5, name: "Circuit Gilles-Villeneuve",track: "Montreal",                trackConfig: null,  startsAtIso: "2026-04-15T17:00:00.000Z" },
  { num: 6, name: "Silverstone",              track: "Silverstone",             trackConfig: null,  startsAtIso: "2026-04-29T17:00:00.000Z" },
  { num: 7, name: "Circuit Zandvoort",        track: "Zandvoort",               trackConfig: "GP",  startsAtIso: "2026-05-13T17:00:00.000Z" },
  { num: 8, name: "Circuit de Spa",           track: "Spa-Francorchamps",       trackConfig: "GP",  startsAtIso: "2026-05-27T17:00:00.000Z" },
];

function statusForDate(d: Date): RoundStatus {
  return d.getTime() < Date.now() ? "COMPLETED" : "UPCOMING";
}

// ---------- Roster ----------
type DriverRow = {
  iracingId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  team: string;
  startNumber: number;
  status: RegistrationStatus;
};
function mapStatus(raw: string): RegistrationStatus {
  const s = raw.trim().toLowerCase();
  if (s === "") return "PENDING";
  if (s.includes("abgemeldet")) return "WITHDRAWN";
  if (s.includes("ausgeschlossen")) return "REJECTED";
  return "APPROVED"; // Startberechtigt
}
function normaliseTeam(name: string): string | null {
  const t = name.trim();
  if (!t) return null;
  if (t === "/" ) return null;
  const lc = t.toLowerCase();
  if (lc === "privat" || lc === "kein team") return null;
  return t;
}

const ROSTER: DriverRow[] = [
  { iracingId: "820006",  firstName: "Andreas",     lastName: "Wuschnakowski", email: "andreas-wuschnakowski@t-online.de", team: "CAS Tech Performance grün",                  startNumber: 15,  status: mapStatus("Startberechtigt") },
  { iracingId: "1120075", firstName: "Marcus",      lastName: "Rothe",          email: "charlie.brown.rothe@googlemail.com", team: "Duck Knife x Sundi Company Team Süß",         startNumber: 21,  status: mapStatus("Startberechtigt") },
  { iracingId: "595882",  firstName: "Ingo",        lastName: "Snel",           email: "ingo.snel@gmail.com",               team: "CAS Tech performance rot",                   startNumber: 8,   status: mapStatus("Startberechtigt") },
  { iracingId: "532947",  firstName: "Dawid",       lastName: "Dlugokecki",     email: "d.dlugokecki@gmail.com",            team: "Speed Eagles",                               startNumber: 44,  status: mapStatus("Startberechtigt") },
  { iracingId: "280636",  firstName: "Kevin",       lastName: "Chmielewski",    email: "kevin.chmielewski@web.de",          team: "Duck Knife x Sundi Company Team Sauer",      startNumber: 27,  status: mapStatus("Startberechtigt") },
  { iracingId: "410704",  firstName: "Dominic",     lastName: "Waack",          email: "dominicwaack@googlemail.com",       team: "Duck Knife x Sundi Company Team Sauer",      startNumber: 16,  status: mapStatus("Startberechtigt") },
  { iracingId: "1057110", firstName: "Ralph",       lastName: "Mielke",         email: "ralle.mielke@t-online.de",          team: "CAS Tech performance grün",                  startNumber: 967, status: mapStatus("Startberechtigt") },
  { iracingId: "709942",  firstName: "Daniel",      lastName: "Brandt",         email: "dbheld75@gmail.com",                team: "CAS Tech performance rot",                   startNumber: 75,  status: mapStatus("Startberechtigt") },
  { iracingId: "583549",  firstName: "Riccardo",    lastName: "Cavoto",         email: "rcavoto@bluewin.ch",                team: "WildCreek Factory Team",                     startNumber: 772, status: mapStatus("Startberechtigt") },
  { iracingId: "827765",  firstName: "Raphael",     lastName: "Böhmer",         email: "letslink2009@gmail.com",            team: "RNR pb Speedworld Academy",                  startNumber: 64,  status: mapStatus("Startberechtigt") },
  { iracingId: "702494",  firstName: "Noel",        lastName: "Zak",            email: "noelinozak@gmail.com",              team: "CGR",                                        startNumber: 29,  status: mapStatus("Startberechtigt") },
  { iracingId: "570291",  firstName: "Michael",     lastName: "Kelnberger",     email: "mkelnberger@yahoo.de",              team: "Flying Arrow Racing 01",                     startNumber: 51,  status: mapStatus("Startberechtigt") },
  { iracingId: "407036",  firstName: "Hubert",      lastName: "Diethard",       email: "hubi1230@gmx.at",                   team: "DanKüchen Motorsport",                       startNumber: 77,  status: mapStatus("Startberechtigt") },
  { iracingId: "1170283", firstName: "Sebastian",   lastName: "Muxfeldt",       email: null,                                team: "MUXI",                                       startNumber: 10,  status: mapStatus("Startberechtigt") },
  { iracingId: "1097285", firstName: "Lars",        lastName: "Schäfer",        email: "delijosse@yahoo.de",                team: "Kein Team",                                  startNumber: 176, status: mapStatus("Startberechtigt") },
  { iracingId: "556288",  firstName: "Sascha",      lastName: "Loechert",       email: "sascha-loechert@t-online.de",       team: "Duck Knife x Sundi Company Team Süß",         startNumber: 71,  status: mapStatus("Startberechtigt") },
  { iracingId: "1108514", firstName: "Laurenz",     lastName: "Hofmann",        email: "laurenz.hofmann@icloud.com",        team: "CGR",                                        startNumber: 24,  status: mapStatus("Startberechtigt") },
  { iracingId: "1312677", firstName: "Moritz",      lastName: "Füßl",           email: "fuesslm@gmx.de",                    team: "Volantis Racing",                            startNumber: 9,   status: mapStatus("Startberechtigt") },
  { iracingId: "710028",  firstName: "Bernhard",    lastName: "Wlach",          email: null,                                team: "DanKüchen Motorsport",                       startNumber: 47,  status: mapStatus("Startberechtigt") },
  { iracingId: "900145",  firstName: "Nigel",       lastName: "Reichert",       email: "nigelreichert1991@gmail.com",       team: "",                                            startNumber: 815, status: mapStatus("Startberechtigt") },
  { iracingId: "912856",  firstName: "Thomas",      lastName: "Herbrig",        email: "thomasherbrig@ipomme.fr",           team: "CAS Tech Performance grün",                  startNumber: 67,  status: mapStatus("Startberechtigt") },
  { iracingId: "634477",  firstName: "Antonio",     lastName: "Cursio",         email: "antoniocursio696@gmail.com",        team: "CAS Tech Performance rot",                   startNumber: 55,  status: mapStatus("Aus der Liga abgemeldet") },
  { iracingId: "453253",  firstName: "Kai",         lastName: "Brendel",        email: "xatosch@gmail.com",                 team: "Kai Brendel",                                startNumber: 68,  status: mapStatus("Startberechtigt") },
  { iracingId: "1378586", firstName: "Holger",      lastName: "Meißner",        email: "holgermeissner@gmx.net",            team: "Race Hobbits",                               startNumber: 232, status: mapStatus("Startberechtigt") },
  { iracingId: "445964",  firstName: "Thomas",      lastName: "FELIX",          email: "thomas@felixmail.ch",               team: "WildCreek Factory Team",                     startNumber: 773, status: mapStatus("Startberechtigt") },
  { iracingId: "991062",  firstName: "Friedrich",   lastName: "Luhn",           email: "friedrich.luhn@gmx.at",             team: "Free Agent",                                 startNumber: 28,  status: mapStatus("") },
];

async function main() {
  // 1. Find league + scoring system
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  if (!league) throw new Error("League cas-sfl-cup not found.");
  const scoring = await prisma.scoringSystem.findUnique({ where: { name: "CAS SFL Cup" } });
  if (!scoring) throw new Error("Scoring system CAS SFL Cup not found.");

  // 2. Find or create season
  const seasonName = "7th Season";
  let season = await prisma.season.findFirst({
    where: { leagueId: league.id, name: seasonName, year: 2026 },
  });
  if (!season) {
    season = await prisma.season.create({
      data: {
        leagueId: league.id,
        name: seasonName,
        year: 2026,
        status: "DRAFT",
        startsOn: new Date("2026-02-18T00:00:00Z"),
        endsOn: new Date("2026-05-27T23:59:59Z"),
        isMulticlass: false,
        proAmEnabled: false,
        scoringSystemId: scoring.id,
        teamScoringMode: "SUM_BEST_N",
        teamScoringBestN: 2,
      },
    });
    console.log(`Created Season ${season.id} (${seasonName})`);
  } else {
    console.log(`Season ${season.id} (${seasonName}) already exists`);
  }

  // 3. Rounds (idempotent on roundNumber)
  for (const r of ROUNDS) {
    const startsAt = new Date(r.startsAtIso);
    const status = statusForDate(startsAt);
    const existing = await prisma.round.findUnique({
      where: { seasonId_roundNumber: { seasonId: season.id, roundNumber: r.num } },
    });
    if (existing) {
      await prisma.round.update({
        where: { id: existing.id },
        data: {
          name: r.name, track: r.track, trackConfig: r.trackConfig,
          startsAt, raceLengthMinutes: 40, status,
        },
      });
      console.log(`R${r.num} (${r.name}): updated [${status}]`);
    } else {
      await prisma.round.create({
        data: {
          seasonId: season.id,
          roundNumber: r.num,
          name: r.name, track: r.track, trackConfig: r.trackConfig,
          startsAt, raceLengthMinutes: 40, status,
          countsForChampionship: true,
        },
      });
      console.log(`R${r.num} (${r.name}): created [${status}]`);
    }
  }

  // 4. Drivers
  let userCreated = 0, userExisting = 0;
  let teamCreated = 0;
  let regCreated = 0, regExisting = 0;
  for (const d of ROSTER) {
    let user = await prisma.user.findUnique({ where: { iracingMemberId: d.iracingId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          iracingMemberId: d.iracingId,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email ?? undefined,
          name: `${d.firstName} ${d.lastName}`,
          role: "DRIVER",
        },
      });
      userCreated++;
    } else {
      userExisting++;
    }

    const teamName = normaliseTeam(d.team);
    let teamId: string | null = null;
    if (teamName) {
      let team = await prisma.team.findFirst({
        where: { seasonId: season.id, name: teamName },
      });
      if (!team) {
        team = await prisma.team.create({
          data: { seasonId: season.id, name: teamName },
        });
        teamCreated++;
      }
      teamId = team.id;
    }

    const reg = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (reg) {
      await prisma.registration.update({
        where: { id: reg.id },
        data: { status: d.status, startNumber: d.startNumber, teamId },
      });
      regExisting++;
    } else {
      await prisma.registration.create({
        data: {
          seasonId: season.id,
          userId: user.id,
          status: d.status,
          startNumber: d.startNumber,
          teamId,
          approvedAt: d.status === "APPROVED" ? new Date() : null,
        },
      });
      regCreated++;
    }
  }

  console.log("\n=== Summary ===");
  console.log("Season:", season.id);
  console.log("Rounds touched:", ROUNDS.length);
  console.log("Users:", userCreated, "created,", userExisting, "already existed");
  console.log("Teams created:", teamCreated);
  console.log("Registrations:", regCreated, "created,", regExisting, "updated");

  const counts = await prisma.registration.groupBy({
    by: ["status"], where: { seasonId: season.id }, _count: { _all: true },
  });
  console.log("Registrations per status:");
  for (const c of counts) console.log(" ", c.status, "=", c._count._all);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
