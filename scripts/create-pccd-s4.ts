import { prisma } from "@/lib/prisma";
import type { RegistrationStatus, RoundStatus } from "@prisma/client";

// 8 rounds, Thursdays at 19:00 Europe/Berlin.
// CET (UTC+1) until DST start 2026-03-29 -> 18:00 UTC; CEST (UTC+2) after -> 17:00 UTC.
type RoundDef = {
  num: number;
  name: string;
  track: string;
  trackConfig: string | null;
  startsAtIso: string;
};
const ROUNDS: RoundDef[] = [
  { num: 1, name: "Watkins Glen",            track: "Watkins Glen",       trackConfig: null,  startsAtIso: "2026-03-12T18:00:00.000Z" },
  { num: 2, name: "Mugello",                 track: "Mugello",            trackConfig: "GP",  startsAtIso: "2026-03-26T18:00:00.000Z" },
  // CEST starts 2026-03-29
  { num: 3, name: "Circuit de Spa-Francorchamps", track: "Spa-Francorchamps", trackConfig: null, startsAtIso: "2026-04-09T17:00:00.000Z" },
  { num: 4, name: "Monza",                   track: "Monza",              trackConfig: "GP",  startsAtIso: "2026-04-23T17:00:00.000Z" },
  { num: 5, name: "Circuit de Barcelona",    track: "Barcelona",          trackConfig: "GP",  startsAtIso: "2026-05-07T17:00:00.000Z" },
  { num: 6, name: "Silverstone",             track: "Silverstone",        trackConfig: "GP",  startsAtIso: "2026-05-21T17:00:00.000Z" },
  { num: 7, name: "Hockenheim",              track: "Hockenheim",         trackConfig: "GP",  startsAtIso: "2026-06-04T17:00:00.000Z" },
  { num: 8, name: "Okayama",                 track: "Okayama",            trackConfig: "FC",  startsAtIso: "2026-06-18T17:00:00.000Z" },
];

function statusForDate(d: Date): RoundStatus {
  return d.getTime() < Date.now() ? "COMPLETED" : "UPCOMING";
}

// Roster from the Google Sheet
type DriverRow = {
  iracingId: string;
  firstName: string;
  lastName: string;
  team: string;
  startNumber: number;
  status: RegistrationStatus;
};
function mapStatus(ligaeinladung: string): RegistrationStatus {
  const s = ligaeinladung.trim().toLowerCase();
  if (s.includes("offen")) return "PENDING";
  return "APPROVED"; // "Member Season 3" or "Angenommen"
}
function normaliseTeam(name: string): string | null {
  const t = name.trim();
  if (!t) return null;
  if (t === "/" || t === "-") return null;
  const lc = t.toLowerCase();
  if (lc === "privat" || lc === "kein team" || lc === "mein eigenes?") return null;
  return t;
}
function parseStartNumber(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

const ROSTER: DriverRow[] = [
  { iracingId: "425985",  firstName: "Jan Tobias",         lastName: "Schrader",     team: "Schrader Racing",        startNumber: 771, status: mapStatus("Member Season 3") },
  { iracingId: "1057110", firstName: "Ralph",              lastName: "Mielke",       team: "CAS Tech Performance",   startNumber: 967, status: mapStatus("Angenommen") },
  { iracingId: "841424",  firstName: "Jürgen Michael",     lastName: "Kraft",        team: "CAS Tech Performance",   startNumber: 23,  status: mapStatus("Member Season 3") },
  { iracingId: "172159",  firstName: "Andre",              lastName: "Rajkovic",     team: "Team Heusinkveld",       startNumber: 99,  status: mapStatus("Member Season 3") },
  { iracingId: "186444",  firstName: "Silvio",             lastName: "Foth",         team: "NJB Performance",        startNumber: 117, status: mapStatus("Angenommen") },
  { iracingId: "916335",  firstName: "Nikolai Maximillian", lastName: "Kropf",       team: "Zero Limit Racing Team", startNumber: 8,   status: mapStatus("Einladung offen") },
  { iracingId: "845397",  firstName: "Don",                lastName: "Utz",          team: "CAS Tech Performance",   startNumber: 101, status: mapStatus("Member Season 3") },
  { iracingId: "735334",  firstName: "Luis",               lastName: "Obregon Avelar", team: "SCHERER eSPORT 992",   startNumber: 992, status: mapStatus("Angenommen") },
  { iracingId: "1145838", firstName: "Mario",              lastName: "Coppola",      team: "-",                      startNumber: 221, status: mapStatus("Einladung offen") },
  { iracingId: "900145",  firstName: "Nigel",              lastName: "Reichert",     team: "Kein Team",              startNumber: 15,  status: mapStatus("Einladung offen") },
  { iracingId: "1067833", firstName: "Marcel",             lastName: "Eibisberger",  team: "Mein Eigenes?",          startNumber: 420, status: mapStatus("Angenommen") },
  { iracingId: "740091",  firstName: "Willi",              lastName: "Brand",        team: "CAS Tech Performance",   startNumber: 68,  status: mapStatus("Member Season 3") },
  { iracingId: "1124831", firstName: "Benjamin",           lastName: "Schlosser",    team: "CBS Racing",             startNumber: 83,  status: mapStatus("Member Season 3") },
  { iracingId: "1021560", firstName: "Klaus",              lastName: "Oberlaender",  team: "Munich eSports",         startNumber: 860, status: mapStatus("Angenommen") },
  { iracingId: "698837",  firstName: "Chistian",           lastName: "Schlosser",    team: "CBS Racing",             startNumber: 74,  status: mapStatus("Member Season 3") },
  { iracingId: "445964",  firstName: "Thomas",             lastName: "Felix",        team: "WildCreek Factory Team", startNumber: 773, status: mapStatus("Angenommen") },
  { iracingId: "583549",  firstName: "Riccardo",           lastName: "Cavoto",       team: "WildCreek Factory Team", startNumber: 772, status: mapStatus("Angenommen") },
  { iracingId: "954834",  firstName: "Sean",               lastName: "Pfennig",      team: "Schrader racing",        startNumber: 775, status: mapStatus("Angenommen") },
  { iracingId: "281539",  firstName: "Robin",              lastName: "Schwengers",   team: "RaceasUnit e-Sports",    startNumber: parseStartNumber("011"), status: mapStatus("Einladung offen") },
  { iracingId: "974264",  firstName: "Andy",               lastName: "Weber",        team: "Munich eSports",         startNumber: 305, status: mapStatus("Angenommen") },
  { iracingId: "1310339", firstName: "Marco",              lastName: "Pelikan",      team: "Simracing:Justfair",     startNumber: 23,  status: mapStatus("Einladung offen") },
];

// Default points tables (copied from SFL — feel free to change in
// /admin/scoring-systems if PCCD uses different ones).
const RACE1: Record<string, number> = {
  "1": 25, "2": 22, "3": 19, "4": 17, "5": 16, "6": 15, "7": 14,
  "8": 13, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};
const RACE2: Record<string, number> = {
  "1": 30, "2": 27, "3": 24, "4": 22, "5": 20, "6": 18, "7": 16,
  "8": 14, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};

async function main() {
  // 1) Find league + scoring system
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) throw new Error("League cas-pccd not found.");
  const scoring = await prisma.scoringSystem.findUnique({ where: { name: "CAS PCCD" } });
  if (!scoring) throw new Error("Scoring system CAS PCCD not found.");

  // Configure scoring system for 2 races
  if (scoring.racesPerRound !== 2 || !scoring.pointsTableRace2) {
    await prisma.scoringSystem.update({
      where: { id: scoring.id },
      data: {
        racesPerRound: 2,
        pointsTable: RACE1,
        pointsTableRace2: RACE2,
      },
    });
    console.log("CAS PCCD scoring: racesPerRound=2, R1+R2 points tables seeded.");
  } else {
    console.log("CAS PCCD scoring already configured for 2 races.");
  }

  // 2) Find or create season
  const seasonName = "Season 04";
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
        startsOn: new Date("2026-03-12T00:00:00Z"),
        endsOn: new Date("2026-06-18T23:59:59Z"),
        isMulticlass: false,
        proAmEnabled: false,
        scoringSystemId: scoring.id,
        teamScoringMode: "SUM_BEST_N",
        teamScoringBestN: 2,
      },
    });
    console.log("Created Season:", season.id);
  } else {
    console.log("Season already exists:", season.id);
  }

  // 3) Rounds (idempotent)
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
          name: r.name,
          track: r.track,
          trackConfig: r.trackConfig,
          startsAt,
          raceLengthMinutes: 50,
          status,
        },
      });
      console.log(`R${r.num} ${r.name}: updated [${status}]`);
    } else {
      await prisma.round.create({
        data: {
          seasonId: season.id,
          roundNumber: r.num,
          name: r.name,
          track: r.track,
          trackConfig: r.trackConfig,
          startsAt,
          raceLengthMinutes: 50,
          status,
          countsForChampionship: true,
        },
      });
      console.log(`R${r.num} ${r.name}: created [${status}]`);
    }
  }

  // 4) Drivers + registrations
  let userCreated = 0, userExisting = 0;
  let teamCreated = 0;
  let regCreated = 0, regExisting = 0;
  for (const d of ROSTER) {
    let user = await prisma.user.findUnique({
      where: { iracingMemberId: d.iracingId },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          iracingMemberId: d.iracingId,
          firstName: d.firstName,
          lastName: d.lastName,
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
