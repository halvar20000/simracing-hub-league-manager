import { prisma } from "@/lib/prisma";
import type { RegistrationStatus } from "@prisma/client";

// ---------- Schedule ----------
type RoundDef = {
  num: number;
  name: string;
  track: string;
  trackConfig: string | null;
  startsAtIso: string; // UTC, accounting for CET (Jan-Mar) vs CEST (Mar 29+)
};
const ROUNDS: RoundDef[] = [
  { num: 1, name: "Autodromo Nazionale Monza",      track: "Monza",          trackConfig: null,            startsAtIso: "2026-01-19T17:45:00.000Z" },
  { num: 2, name: "Circuit de Spa-Francorchamps",   track: "Spa-Francorchamps", trackConfig: null,         startsAtIso: "2026-02-02T17:45:00.000Z" },
  { num: 3, name: "Circuit Zandvoort",              track: "Zandvoort",      trackConfig: null,            startsAtIso: "2026-02-16T17:45:00.000Z" },
  { num: 4, name: "Donington Park",                 track: "Donington Park", trackConfig: "Racing Circuit", startsAtIso: "2026-03-02T17:45:00.000Z" },
  { num: 5, name: "Oulton Park",                    track: "Oulton Park",    trackConfig: null,            startsAtIso: "2026-03-16T17:45:00.000Z" },
  // CEST (UTC+2) starts March 29, 2026 — round 6 onward is 16:45 UTC
  { num: 6, name: "Nürburgring GP",                 track: "Nürburgring",    trackConfig: "GP",            startsAtIso: "2026-03-30T16:45:00.000Z" },
  { num: 7, name: "Mount Panorama",                 track: "Mount Panorama", trackConfig: null,            startsAtIso: "2026-04-13T16:45:00.000Z" },
  { num: 8, name: "Road Atlanta",                   track: "Road Atlanta",   trackConfig: null,            startsAtIso: "2026-04-27T16:45:00.000Z" },
];

// ---------- Roster (33 drivers) ----------
type DriverRow = {
  iracingId: string;
  firstName: string;
  lastName: string;
  email: string;
  team: string;       // raw team name from CSV; "" / "/" / "Privat" -> no team
  startNumber: number;
  status: RegistrationStatus;
};
function mapStatus(raw: string): RegistrationStatus {
  const s = raw.trim().toLowerCase();
  if (s.includes("ausgeschlossen")) return "REJECTED";
  if (s.includes("abgemeldet")) return "WITHDRAWN";
  return "APPROVED"; // Teilnehmer Season 2 / Einladung angenommen
}

const ROSTER: DriverRow[] = [
  { iracingId: "445964",  firstName: "Thomas",     lastName: "Felix",                 email: "thomas@felixmail.ch",          team: "WildCreek Factory Team",   startNumber: 773, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "583549",  firstName: "Riccardo",   lastName: "Cavoto",                email: "rcavoto@bluewin.ch",           team: "WildCreek Factory Team",   startNumber: 772, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "915496",  firstName: "Julian",     lastName: "Weilguny",              email: "julian12w3q@gmail.com",        team: "Privat",                   startNumber: 67,  status: mapStatus("Einladung angenommen") },
  { iracingId: "1005962", firstName: "Venanzi",    lastName: "Pit",                   email: "PitVenanzi@outlook.com",       team: "Heavy Metal",              startNumber: 1,   status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "1057110", firstName: "Ralph",      lastName: "Mielke",                email: "ralle.mielke@t-online.de",     team: "Cas Tech Performance rot", startNumber: 967, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "718865",  firstName: "Alexander",  lastName: "Hoche",                 email: "alexander.hoche@freenet.de",   team: "W&S e-Motorsport",         startNumber: 7,   status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "172159",  firstName: "Andre",      lastName: "Rajkovic",              email: "andre.rajkovic@gmail.com",     team: "Team Heusinkveld",         startNumber: 99,  status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "479423",  firstName: "Thomas",     lastName: "Kuebler",               email: "kuebler.thomas@web.de",        team: "CAS Tech Performance gelb", startNumber: 173, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "838203",  firstName: "Marco",      lastName: "Burchhardt",            email: "marcoltc@gmx.de",              team: "CAS Tech Performance gelb", startNumber: 218, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "115215",  firstName: "Andreas",    lastName: "Dirnberger",            email: "andi.dirni@t-online.de",       team: "SCHERER eSPORT",           startNumber: 81,  status: mapStatus("Abgemeldet") },
  { iracingId: "946603",  firstName: "Noah",       lastName: "Kovacevic",             email: "noah.kov34@gmail.com",         team: "W&S e-Motorsport",         startNumber: 34,  status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "250311",  firstName: "Jens",       lastName: "Hartrampf",             email: "j.hartrampf@gmx.de",           team: "W&S e-Motorsport",         startNumber: 718, status: mapStatus("Einladung angenommen") },
  { iracingId: "350029",  firstName: "Juergen",    lastName: "Raab",                  email: "raabko91@gmail.com",           team: "Melanzani Racing",         startNumber: 187, status: mapStatus("Einladung angenommen") },
  { iracingId: "1387737", firstName: "Mario",      lastName: "Rohrschneider",         email: "mariorohrschneider1996@gmail.com", team: "Cas Tech Performance rot", startNumber: 14, status: mapStatus("Einladung angenommen") },
  { iracingId: "693261",  firstName: "Juerg",      lastName: "Fehr",                  email: "juergfehr@hotmail.com",        team: "Wildbach",                 startNumber: 378, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "1380833", firstName: "Florian",    lastName: "Brechmann",             email: "florian.brechmann@gmx.de",     team: "/",                        startNumber: 22,  status: mapStatus("Einladung angenommen") },
  { iracingId: "181516",  firstName: "Matthias",   lastName: "Beer",                  email: "matthias.beer1@gmx.net",       team: "Melanzani Racing",         startNumber: 82,  status: mapStatus("Einladung angenommen") },
  { iracingId: "891101",  firstName: "Michael",    lastName: "Gessner",               email: "mi_gessner@web.de",            team: "VR46 Racing",              startNumber: 46,  status: mapStatus("Einladung angenommen") },
  { iracingId: "564275",  firstName: "Christian",  lastName: "Feldmann",              email: "christian@febea.de",           team: "Red-Lantern-Racing",       startNumber: 145, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "1150978", firstName: "Ciprian",    lastName: "Bagyinszki",            email: "blackmamb19950905@gmail.com",  team: "/",                        startNumber: 95,  status: mapStatus("Einladung angenommen") },
  { iracingId: "845397",  firstName: "Don",        lastName: "Utz",                   email: "oliver.utz@gmx.de",            team: "Cas Tech Performance rot", startNumber: 101, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "841424",  firstName: "Jürgen Michael", lastName: "Kraft",             email: "j.m.kraft@ish.de",             team: "CAS Tech Performance gelb", startNumber: 23, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "249259",  firstName: "Philip",     lastName: "Eckert",                email: "eckisimracing@gmail.com",      team: "Heavy Metal",              startNumber: 41,  status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "727299",  firstName: "Benjamin",   lastName: "Moersch",               email: "benschi268@googlemail.com",    team: "Firefly eRacing",          startNumber: 64,  status: mapStatus("Abgemeldet") },
  { iracingId: "709942",  firstName: "Daniel",     lastName: "Brandt",                email: "dbheld75@gmail.com",           team: "CAS Tech Performance grün", startNumber: 75, status: mapStatus("Teilnehmer Season 2") },
  { iracingId: "844831",  firstName: "Maurice",    lastName: "Becker",                email: "maurice449977@gmail.com",      team: "M&J Downforce",            startNumber: 49,  status: mapStatus("Einladung angenommen") },
  { iracingId: "586530",  firstName: "Nicolas",    lastName: "Romanus",               email: "kuramanr@hotmail.com",         team: "Privateer",                startNumber: 127, status: mapStatus("Einladung angenommen") },
  { iracingId: "303625",  firstName: "Bendix",     lastName: "Wermeister",            email: "bendix.wermeister@gmail.com",  team: "heartcore",                startNumber: 23,  status: mapStatus("Einladung angenommen") },
  { iracingId: "436580",  firstName: "Felix",      lastName: "Löhner",                email: "felix@loehni.de",              team: "heartcore",                startNumber: 3,   status: mapStatus("Einladung angenommen") },
  { iracingId: "916335",  firstName: "Nikolai Maximillian", lastName: "Kropf",        email: "mkropf45@gmail.com",           team: "Zero Limit Racing Team",   startNumber: 8,   status: mapStatus("Einladung angenommen") },
  { iracingId: "348458",  firstName: "Kevin",      lastName: "Hilgenhövel",           email: "kevin.hilgenhoevel@icloud.con", team: "ETH Tuning",              startNumber: 88,  status: mapStatus("Aus Liga ausgeschlossen") },
  { iracingId: "48914",   firstName: "Marcel",     lastName: "Unger",                 email: "Unger879@googlemail.com",      team: "MHvMotorsports",           startNumber: 676, status: mapStatus("Einladung angenommen") },
  { iracingId: "965844",  firstName: "Paul",       lastName: "Rossmann",              email: "paul-rossmann@web.de",         team: "heartcore",                startNumber: 599, status: mapStatus("Einladung angenommen") },
];

function normaliseTeam(name: string): string | null {
  const t = name.trim();
  if (!t || t === "/" || t.toLowerCase() === "privat") return null;
  return t;
}

async function main() {
  // 1. Find league
  const league = await prisma.league.findUnique({
    where: { slug: "cas-tss-gt4" },
  });
  if (!league) throw new Error("League cas-tss-gt4 not found.");

  // 2. Find scoring system
  const scoring = await prisma.scoringSystem.findUnique({
    where: { name: "CAS GT4 Masters" },
  });
  if (!scoring) throw new Error("Scoring system CAS GT4 Masters not found.");

  // 3. Find or create the season
  const seasonName = "3rd Season";
  let season = await prisma.season.findFirst({
    where: { leagueId: league.id, name: seasonName, year: 2026 },
  });
  if (!season) {
    season = await prisma.season.create({
      data: {
        leagueId: league.id,
        name: seasonName,
        year: 2026,
        status: "DRAFT", // can be flipped later
        startsOn: new Date("2026-01-19T00:00:00Z"),
        endsOn: new Date("2026-04-27T23:59:59Z"),
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

  // 4. Create rounds (idempotent on roundNumber)
  for (const r of ROUNDS) {
    const existing = await prisma.round.findUnique({
      where: { seasonId_roundNumber: { seasonId: season.id, roundNumber: r.num } },
    });
    if (existing) {
      console.log(`Round ${r.num} (${r.name}) already exists; updating in place`);
      await prisma.round.update({
        where: { id: existing.id },
        data: {
          name: r.name,
          track: r.track,
          trackConfig: r.trackConfig,
          startsAt: new Date(r.startsAtIso),
          raceLengthMinutes: 45,
          status: "COMPLETED",
        },
      });
    } else {
      await prisma.round.create({
        data: {
          seasonId: season.id,
          roundNumber: r.num,
          name: r.name,
          track: r.track,
          trackConfig: r.trackConfig,
          startsAt: new Date(r.startsAtIso),
          raceLengthMinutes: 45,
          status: "COMPLETED",
          countsForChampionship: true,
        },
      });
      console.log(`Created Round ${r.num} (${r.name})`);
    }
  }

  // 5. Upsert Users + Teams + Registrations
  let userCreated = 0, userExisting = 0;
  let teamCreated = 0;
  let regCreated = 0, regExisting = 0;
  for (const d of ROSTER) {
    // User
    let user = await prisma.user.findUnique({
      where: { iracingMemberId: d.iracingId },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          iracingMemberId: d.iracingId,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email,
          name: `${d.firstName} ${d.lastName}`,
          role: "DRIVER",
        },
      });
      userCreated++;
    } else {
      userExisting++;
    }

    // Team (per-season unique by name)
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

    // Registration (upsert on (seasonId, userId))
    const reg = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (reg) {
      await prisma.registration.update({
        where: { id: reg.id },
        data: {
          status: d.status,
          startNumber: d.startNumber,
          teamId,
        },
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

  // Final per-status breakdown
  const counts = await prisma.registration.groupBy({
    by: ["status"],
    where: { seasonId: season.id },
    _count: { _all: true },
  });
  console.log("Registrations per status:");
  for (const c of counts) {
    console.log(" ", c.status, "=", c._count._all);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
