#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: TeamResult + TeamRoundDriver + Team.iracingTeamId + CarClass.iracingCarClassId
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// --- 1a. Team.iracingTeamId
{
  const lines = s.split("\n");
  let inT = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+Team\s*{/.test(lines[i])) { inT = true; continue; }
    if (inT && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("Team brace not found."); process.exit(1); }
  if (!/^\s*iracingTeamId\s+Int\?/m.test(s)) {
    lines.splice(close, 0, "  iracingTeamId Int?       @unique");
    s = lines.join("\n");
    console.log("Team: added iracingTeamId.");
  }
}

// --- 1b. CarClass.iracingCarClassId
{
  const lines = s.split("\n");
  let inC = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+CarClass\s*{/.test(lines[i])) { inC = true; continue; }
    if (inC && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("CarClass brace not found."); process.exit(1); }
  if (!/^\s*iracingCarClassId\s+Int\?/m.test(s)) {
    lines.splice(close, 0, "  iracingCarClassId Int?");
    s = lines.join("\n");
    console.log("CarClass: added iracingCarClassId.");
  }
}

// --- 1c. Team.results back-relation
if (!/^\s*teamResults\s+TeamResult\[\]/m.test(s)) {
  s = s.replace(/(model Team \{[\s\S]*?registrations\s+Registration\[\])/, "$1\n  teamResults    TeamResult[]");
  console.log("Team: added teamResults back-relation.");
}

// --- 1d. CarClass.teamResults back-relation
if (!/^\s*teamResults\s+TeamResult\[\]/m.test(s.replace(/model Team \{[\s\S]*?\n}/, ""))) {
  s = s.replace(/(model CarClass \{[\s\S]*?fprAwards\s+FPRAward\[\])/, "$1\n  teamResults   TeamResult[]");
  console.log("CarClass: added teamResults back-relation.");
}

// --- 1e. Round.teamResults back-relation
if (!/Round[\s\S]{0,2000}teamResults\s+TeamResult\[\]/m.test(s)) {
  s = s.replace(/(model Round \{[\s\S]*?incidentReports\s+IncidentReport\[\])/, "$1\n  teamResults     TeamResult[]");
  console.log("Round: added teamResults back-relation.");
}

// --- 1f. Registration.teamRoundDrivers back-relation
if (!/Registration[\s\S]{0,3000}teamRoundDrivers\s+TeamRoundDriver\[\]/m.test(s)) {
  s = s.replace(/(model Registration \{[\s\S]*?involvedInIncidents\s+IncidentReportInvolvedDriver\[\])/, "$1\n  teamRoundDrivers   TeamRoundDriver[]");
  console.log("Registration: added teamRoundDrivers back-relation.");
}

// --- 1g. Car.teamResults back-relation
if (!/Car \{[\s\S]{0,1000}teamResults\s+TeamResult\[\]/m.test(s)) {
  s = s.replace(/(model Car \{[\s\S]*?raceResults\s+RaceResult\[\])/, "$1\n  teamResults   TeamResult[]");
  console.log("Car: added teamResults back-relation.");
}

// --- 1h. TeamResult + TeamRoundDriver models
if (!/^model\s+TeamResult\s*{/m.test(s)) {
  s += `

model TeamResult {
  id                         String        @id @default(cuid())
  roundId                    String
  round                      Round         @relation(fields: [roundId], references: [id], onDelete: Cascade)
  teamId                     String
  team                       Team          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  raceNumber                 Int           @default(1)

  finishPosition             Int
  classPosition              Int?
  lapsCompleted              Int           @default(0)
  raceDistancePct            Int           @default(0)
  totalTimeMs                Int?
  bestLapTimeMs              Int?
  totalIncidents             Int           @default(0)
  finishStatus               FinishStatus  @default(CLASSIFIED)
  startPosition              Int?

  rawPointsAwarded           Int           @default(0)
  participationPointsAwarded Int           @default(0)
  manualPenaltyPoints        Int           @default(0)
  correctionPoints           Int           @default(0)

  carId                      String?
  car                        Car?          @relation(fields: [carId], references: [id])
  carClassId                 String?
  carClass                   CarClass?     @relation(fields: [carClassId], references: [id])

  participations             TeamRoundDriver[]

  createdAt                  DateTime      @default(now())
  updatedAt                  DateTime      @updatedAt

  @@unique([roundId, teamId, raceNumber])
}

model TeamRoundDriver {
  id              String       @id @default(cuid())
  teamResultId    String
  teamResult      TeamResult   @relation(fields: [teamResultId], references: [id], onDelete: Cascade)
  registrationId  String
  registration    Registration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  lapsCompleted   Int          @default(0)
  lapsLed         Int          @default(0)
  bestLapTimeMs   Int?
  averageLapMs    Int?
  incidents       Int          @default(0)
  iRating         Int?
  finishStatus    FinishStatus @default(CLASSIFIED)

  @@unique([teamResultId, registrationId])
}
`;
  console.log("Schema: appended TeamResult + TeamRoundDriver models.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Parser: surface team-level rows + nested driver_results
# ===========================================================================
cat > outputs-tmp/patch-parser.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/iracing-json.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("ParsedTeam")) {
  console.log("Parser: team support already wired.");
  process.exit(0);
}

// Append the team types and a parser fn that builds them.
s += `

// ============================================================================
// TEAM PARSER (for IEC and other team events)
// ============================================================================

export interface ParsedTeamDriver {
  custId: number;
  displayName: string;
  countryCode: string | null;
  lapsComplete: number;
  lapsLed: number;
  averageLapMs: number | null;
  bestLapMs: number | null;
  incidents: number;
  iRating: number | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}

export interface ParsedTeam {
  iracingTeamId: number;
  displayName: string; // team name, e.g. "SCK Racing #Cyan"
  /** 1-based finish position. */
  finishPosition: number;
  classPosition: number | null;
  lapsComplete: number;
  startingPosition: number | null;
  bestLapMs: number | null;
  averageLapMs: number | null;
  totalIncidents: number;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
  carIracingId: number | null;
  carName: string | null;
  carClassIracingId: number | null;
  carClassName: string | null;
  carClassShortName: string | null;
  drivers: ParsedTeamDriver[];
}

export interface ParsedTeamSession {
  raceNumber: number;
  simSessionName: string;
  simSessionType: number;
  simSessionNumber: number;
  teams: ParsedTeam[];
  /** Highest laps_complete across all teams — for distance % calculation. */
  maxLaps: number;
}

export interface ParsedTeamEvent {
  subsessionId: number;
  trackName: string;
  trackConfig: string | null;
  startTime: Date;
  endTime: Date | null;
  leagueName: string | null;
  sessions: ParsedTeamSession[];
}

function reasonToStatus(reason: string | undefined): ParsedTeam["finishStatus"] {
  const r = (reason ?? "").toLowerCase();
  if (!r || r === "running" || r.includes("classified")) return "CLASSIFIED";
  if (r.includes("disqualif")) return "DSQ";
  if (r.includes("disconnect")) return "DSQ";
  if (r.includes("did not start") || r === "dns") return "DNS";
  return "DNF";
}

function tenK(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v / 10);
}

function buildTeamSession(
  s: any,
  raceNumber: number
): ParsedTeamSession {
  const rows: any[] = Array.isArray(s?.results) ? s.results : [];
  const teams: ParsedTeam[] = rows
    .filter((r) => typeof r?.team_id === "number" && Array.isArray(r?.driver_results))
    .map((r) => {
      const startPos =
        typeof r.starting_position === "number" && r.starting_position >= 0
          ? r.starting_position + 1
          : null;
      const drivers: ParsedTeamDriver[] = (r.driver_results || []).map((d: any) => ({
        custId: d.cust_id,
        displayName: String(d.display_name ?? ""),
        countryCode:
          typeof d.country_code === "string" && d.country_code.length === 2
            ? d.country_code.toUpperCase()
            : null,
        lapsComplete: typeof d.laps_complete === "number" ? d.laps_complete : 0,
        lapsLed: typeof d.laps_lead === "number" ? d.laps_lead : 0,
        averageLapMs: tenK(d.average_lap),
        bestLapMs: tenK(d.best_lap_time),
        incidents: typeof d.incidents === "number" ? d.incidents : 0,
        iRating:
          typeof d.newi_rating === "number" && d.newi_rating > 0 ? d.newi_rating : null,
        reasonOut: String(d.reason_out ?? "Running"),
        finishStatus: reasonToStatus(d.reason_out),
      }));
      return {
        iracingTeamId: r.team_id,
        displayName: String(r.display_name ?? ""),
        finishPosition: (typeof r.finish_position === "number" ? r.finish_position : 0) + 1,
        classPosition:
          typeof r.finish_position_in_class === "number" && r.finish_position_in_class >= 0
            ? r.finish_position_in_class + 1
            : null,
        lapsComplete: typeof r.laps_complete === "number" ? r.laps_complete : 0,
        startingPosition: startPos,
        bestLapMs: tenK(r.best_lap_time),
        averageLapMs: tenK(r.average_lap),
        totalIncidents: typeof r.incidents === "number" ? r.incidents : 0,
        reasonOut: String(r.reason_out ?? "Running"),
        finishStatus: reasonToStatus(r.reason_out),
        carIracingId: typeof r.car_id === "number" ? r.car_id : null,
        carName: typeof r.car_name === "string" ? r.car_name : null,
        carClassIracingId: typeof r.car_class_id === "number" ? r.car_class_id : null,
        carClassName: typeof r.car_class_name === "string" ? r.car_class_name : null,
        carClassShortName:
          typeof r.car_class_short_name === "string" ? r.car_class_short_name : null,
        drivers,
      };
    });
  const maxLaps = teams.reduce((m, t) => Math.max(m, t.lapsComplete), 0);
  return {
    raceNumber,
    simSessionName: String(s?.simsession_name ?? ""),
    simSessionType: typeof s?.simsession_type === "number" ? s.simsession_type : 0,
    simSessionNumber: typeof s?.simsession_number === "number" ? s.simsession_number : 0,
    teams,
    maxLaps,
  };
}

/**
 * Returns true if the JSON looks like a team event (top-level rows have
 * team_id and a driver_results array).
 */
export function isTeamEvent(input: unknown): boolean {
  const wrapper = input as { type?: string; data?: any } | undefined;
  if (!wrapper || wrapper.type !== "event_result" || !wrapper.data) return false;
  const all: any[] = Array.isArray(wrapper.data.session_results)
    ? wrapper.data.session_results
    : [];
  for (const s of all) {
    for (const r of s.results || []) {
      if (typeof r?.team_id === "number" && Array.isArray(r?.driver_results)) {
        return true;
      }
    }
  }
  return false;
}

export function parseIracingTeamEventJson(input: unknown): ParsedTeamEvent {
  const wrapper = input as { type?: string; data?: any } | undefined;
  if (!wrapper || wrapper.type !== "event_result" || !wrapper.data) {
    throw new IracingJsonParseError(
      'Expected an iRacing event-result JSON object with team rows.'
    );
  }
  const data = wrapper.data;
  const all: any[] = Array.isArray(data.session_results) ? data.session_results : [];

  // RACE sessions only for now (qualify scoring TBD per league policy).
  const raceSessions = all
    .filter((s) => s?.simsession_type === 6)
    .sort((a, b) => (a.simsession_number ?? 0) - (b.simsession_number ?? 0));

  const sessions: ParsedTeamSession[] = raceSessions.map((s, i) =>
    buildTeamSession(s, i + 1)
  );

  return {
    subsessionId: typeof data.subsession_id === "number" ? data.subsession_id : 0,
    trackName: data.track?.track_name ?? "Unknown",
    trackConfig:
      data.track?.config_name && data.track.config_name !== "N/A"
        ? data.track.config_name
        : null,
    startTime: data.start_time ? new Date(data.start_time) : new Date(),
    endTime: data.end_time ? new Date(data.end_time) : null,
    leagueName: typeof data.league_name === "string" ? data.league_name : null,
    sessions,
  };
}
`;
fs.writeFileSync(FILE, s);
console.log("Parser: team-event support appended.");
EOF
node outputs-tmp/patch-parser.mjs

# ===========================================================================
# 3. Importer: detect team events + write TeamResults + TeamRoundDriver + per-driver RaceResults
# ===========================================================================
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("importTeamEventJson")) {
  console.log("Importer: team handling already wired.");
  process.exit(0);
}

// Add imports we need.
s = s.replace(
  `import {
  parseIracingEventJson,
  IracingJsonParseError,
  type ParsedEvent,
} from "@/lib/iracing-json";`,
  `import {
  parseIracingEventJson,
  parseIracingTeamEventJson,
  isTeamEvent,
  IracingJsonParseError,
  type ParsedEvent,
  type ParsedTeamEvent,
} from "@/lib/iracing-json";`
);

// Append the team importer + dispatcher.
s += `

// ============================================================================
// TEAM-EVENT IMPORT (IEC etc.)
// Creates: TeamResult per team + TeamRoundDriver per stint + per-driver RaceResult
//          (so we still have stint data + iRating tracking + per-driver views).
// REPLACE policy: wipes existing TeamResults + RaceResults for the round.
// ============================================================================

interface ResolvedCarClass {
  id: string;
}

async function resolveCarClassForTeamEvent(
  seasonId: string,
  iracingCarClassId: number | null,
  carClassName: string | null,
  carClassShortName: string | null
): Promise<ResolvedCarClass | null> {
  if (iracingCarClassId != null) {
    const found = await prisma.carClass.findFirst({
      where: { seasonId, iracingCarClassId },
      select: { id: true },
    });
    if (found) return found;
  }
  // Try by name match.
  if (carClassShortName) {
    const byName = await prisma.carClass.findFirst({
      where: {
        seasonId,
        OR: [
          { name: { equals: carClassShortName, mode: "insensitive" } },
          { shortCode: { equals: carClassShortName.toUpperCase().slice(0, 8) } },
        ],
      },
      select: { id: true },
    });
    if (byName) {
      // Backfill iracingCarClassId on the matched class for next time.
      if (iracingCarClassId != null) {
        await prisma.carClass.updateMany({
          where: { id: byName.id, iracingCarClassId: null },
          data: { iracingCarClassId },
        });
      }
      return byName;
    }
  }
  // Auto-create.
  const shortCode = (carClassShortName ?? carClassName ?? "ALL").toUpperCase().slice(0, 8);
  // shortCode must be unique per season.
  let unique = shortCode;
  let n = 2;
  while (await prisma.carClass.findFirst({ where: { seasonId, shortCode: unique }, select: { id: true } })) {
    unique = (shortCode + n).slice(0, 8);
    n++;
  }
  const created = await prisma.carClass.create({
    data: {
      seasonId,
      name: carClassName ?? carClassShortName ?? "Class",
      shortCode: unique,
      iracingCarClassId,
    },
  });
  return { id: created.id };
}

async function resolveTeam(
  seasonId: string,
  iracingTeamId: number,
  displayName: string
): Promise<{ id: string } | null> {
  const existing = await prisma.team.findFirst({
    where: { seasonId, iracingTeamId },
    select: { id: true },
  });
  if (existing) return existing;
  // Try name match (admin may have created the team manually).
  const byName = await prisma.team.findFirst({
    where: { seasonId, name: { equals: displayName, mode: "insensitive" } },
    select: { id: true },
  });
  if (byName) {
    await prisma.team.update({
      where: { id: byName.id },
      data: { iracingTeamId },
    });
    return byName;
  }
  // Auto-create.
  const created = await prisma.team.create({
    data: { seasonId, name: displayName || \`Team #\${Math.abs(iracingTeamId)}\`, iracingTeamId },
  });
  return { id: created.id };
}

export async function importTeamEventJson(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  parsed: ParsedTeamEvent
): Promise<{ teamsImported: number; driverParticipations: number; unmatchedCustIds: number[] }> {
  // Build cust_id → registration map
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: { user: true },
  });
  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentTeamId: string | null }>();
  for (const reg of registrations) {
    const raw = reg.user.iracingMemberId;
    if (!raw) continue;
    const id = parseInt(raw, 10);
    if (!Number.isNaN(id)) {
      memberMap.set(id, {
        regId: reg.id,
        userId: reg.userId,
        currentCountry: reg.user.countryCode,
        currentTeamId: reg.teamId,
      });
    }
  }

  // REPLACE policy: wipe existing for the round
  await prisma.teamResult.deleteMany({ where: { roundId } });
  await prisma.raceResult.deleteMany({ where: { roundId } });

  let teamsImported = 0;
  let driverParticipations = 0;
  const unmatched = new Set<number>();

  for (const session of parsed.sessions) {
    for (const team of session.teams) {
      const carClass = await resolveCarClassForTeamEvent(
        seasonId,
        team.carClassIracingId,
        team.carClassName,
        team.carClassShortName
      );
      const car = team.carIracingId
        ? await (async () => {
            const exist = await prisma.car.findFirst({
              where: { seasonId, iracingCarId: team.carIracingId },
              select: { id: true },
            });
            if (exist) return exist;
            return prisma.car.create({
              data: {
                seasonId,
                carClassId: carClass!.id,
                name: team.carName ?? \`iRacing #\${team.carIracingId}\`,
                iracingCarId: team.carIracingId,
              },
              select: { id: true },
            });
          })()
        : null;

      const teamRow = await resolveTeam(seasonId, team.iracingTeamId, team.displayName);
      if (!teamRow) continue;

      const distancePct =
        session.maxLaps > 0
          ? Math.min(100, Math.floor((team.lapsComplete / session.maxLaps) * 100))
          : 0;

      const teamResult = await prisma.teamResult.create({
        data: {
          roundId,
          teamId: teamRow.id,
          raceNumber: session.raceNumber,
          finishPosition: team.finishPosition,
          classPosition: team.classPosition,
          startPosition: team.startingPosition,
          lapsCompleted: team.lapsComplete,
          raceDistancePct: distancePct,
          bestLapTimeMs: team.bestLapMs,
          totalIncidents: team.totalIncidents,
          finishStatus: team.finishStatus,
          carId: car?.id ?? null,
          carClassId: carClass?.id ?? null,
        },
      });
      teamsImported++;

      for (const d of team.drivers) {
        const reg = memberMap.get(d.custId);
        if (!reg) {
          unmatched.add(d.custId);
          continue;
        }
        // Update country code if differs
        if (d.countryCode && d.countryCode !== reg.currentCountry) {
          await prisma.user.update({
            where: { id: reg.userId },
            data: { countryCode: d.countryCode },
          });
          reg.currentCountry = d.countryCode;
        }
        // Sync registration's current team if needed
        if (teamRow.id !== reg.currentTeamId) {
          await prisma.registration.update({
            where: { id: reg.regId },
            data: { teamId: teamRow.id },
          });
          reg.currentTeamId = teamRow.id;
        }

        await prisma.teamRoundDriver.create({
          data: {
            teamResultId: teamResult.id,
            registrationId: reg.regId,
            lapsCompleted: d.lapsComplete,
            lapsLed: d.lapsLed,
            bestLapTimeMs: d.bestLapMs,
            averageLapMs: d.averageLapMs,
            incidents: d.incidents,
            iRating: d.iRating,
            finishStatus: d.finishStatus,
          },
        });
        driverParticipations++;

        // Per-driver RaceResult — gives stint data to existing per-driver views.
        const driverDistancePct =
          session.maxLaps > 0
            ? Math.min(100, Math.floor((d.lapsComplete / session.maxLaps) * 100))
            : 0;
        await prisma.raceResult.create({
          data: {
            roundId,
            registrationId: reg.regId,
            raceNumber: session.raceNumber,
            finishPosition: team.finishPosition,
            classPosition: team.classPosition,
            startPosition: team.startingPosition,
            lapsCompleted: d.lapsComplete,
            raceDistancePct: driverDistancePct,
            bestLapTimeMs: d.bestLapMs,
            iRating: d.iRating,
            incidents: d.incidents,
            finishStatus: d.finishStatus,
            carId: car?.id ?? null,
          },
        });
      }
    }
  }

  // Recompute scoring for the round (drives team points + driver points).
  await recomputeRoundScoring(prisma, roundId);

  return {
    teamsImported,
    driverParticipations,
    unmatchedCustIds: Array.from(unmatched),
  };
}

// ============================================================================
// DISPATCHER: original importIracingJson now branches on event type.
// ============================================================================
` +
// Prepend a wrapper: keep the existing importIracingJson but make it dispatch.
"";

// Replace the importIracingJson body's parse call with a dispatcher.
s = s.replace(
  `  let parsed: ParsedEvent;
  try {
    parsed = parseIracingEventJson(JSON.parse(text));
  } catch (e) {`,
  `  // Dispatch on event shape: team event vs. per-driver event.
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch {
    redirect(
      \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/import-json?error=\${encodeURIComponent(
        "File is not valid JSON"
      )}\`
    );
  }
  if (isTeamEvent(raw)) {
    let parsedTeam: ParsedTeamEvent;
    try {
      parsedTeam = parseIracingTeamEventJson(raw);
    } catch (e) {
      const msg = e instanceof IracingJsonParseError ? e.message : "Could not parse team JSON";
      redirect(
        \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/import-json?error=\${encodeURIComponent(msg)}\`
      );
    }
    const result = await importTeamEventJson(leagueSlug, seasonId, roundId, parsedTeam);
    revalidatePath(
      \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}\`
    );
    revalidatePath(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}\`
    );
    revalidatePath(\`/leagues/\${leagueSlug}/seasons/\${seasonId}/standings\`);
    const params = new URLSearchParams({
      imported: String(result.driverParticipations),
      races: String(parsedTeam.sessions.length),
      unmatchedCount: String(result.unmatchedCustIds.length),
    });
    redirect(
      \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/import-json?\${params.toString()}\`
    );
  }

  let parsed: ParsedEvent;
  try {
    parsed = parseIracingEventJson(raw);
  } catch (e) {`
);

fs.writeFileSync(FILE, s);
console.log("Importer: team-event dispatcher + importer wired.");
EOF
node outputs-tmp/patch-importer.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "IEC stage 1: TeamResult + TeamRoundDriver schema, team-event JSON parser + importer (per-team + per-driver-stint)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Next stage (UI): team standings + per-round team view + de-emphasise driver tab for IEC."
