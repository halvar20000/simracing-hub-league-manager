/**
 * Parser for the iRacing event-result JSON downloaded from a hosted /league
 * subsession. The wire format is `{ type: "event_result", data: {...} }`.
 *
 * iRacing stores all lap times as 10000ths of a second.  We convert to
 * milliseconds (× 0.1) for storage in our schema.
 */

export type ParsedSessionKind = "QUALIFY" | "RACE";

export interface ParsedDriver {
  custId: number;
  displayName: string;
  countryCode: string | null;
  /** 1-based finish position (iRacing uses 0-based; we add 1) */
  finishPosition: number;
  /** 1-based starting grid position, or null if unknown */
  startingPosition: number | null;
  lapsComplete: number;
  bestLapMs: number | null;
  qualLapMs: number | null;
  incidents: number;
  iRating: number | null;
  carClassShortName: string | null;
  carIracingId: number | null;
  carName: string | null;
  carNumber: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}

export interface ParsedSession {
  kind: ParsedSessionKind;
  /** 1 for the only/first race, 2 for the second race in multi-race rounds */
  raceNumber: number;
  simSessionName: string;
  simSessionType: number;
  simSessionNumber: number;
  drivers: ParsedDriver[];
  /** Highest laps_complete in this session — used to compute distance % */
  maxLaps: number;
}

export interface ParsedEvent {
  subsessionId: number;
  trackName: string;
  trackConfig: string | null;
  startTime: Date;
  endTime: Date | null;
  leagueName: string | null;
  sessions: ParsedSession[];
  raw: { rawSessionNames: string[] };
}

export class IracingJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IracingJsonParseError";
  }
}

function mapReasonOut(reason: string | undefined): ParsedDriver["finishStatus"] {
  const r = (reason ?? "").toLowerCase();
  if (!r || r === "running" || r.includes("classified")) return "CLASSIFIED";
  if (r.includes("disqualif")) return "DSQ";
  // Match IRLM behaviour: a disconnect is treated as DSQ so the
  // DSQ-forfeit rule still applies in leagues that use it.
  if (r.includes("disconnect")) return "DSQ";
  if (r.includes("did not start") || r === "dns") return "DNS";
  return "DNF";
}

function tenThousandthsToMs(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v / 10);
}

function buildSession(
  s: any,
  kind: ParsedSessionKind,
  raceNumber: number
): ParsedSession {
  const rows: any[] = Array.isArray(s?.results) ? s.results : [];

  // For solo sessions, each row IS a driver and has cust_id directly.
  // For team sessions (e.g. IEC), each row is a TEAM (no cust_id, may have a
  // negative team_id) and the actual drivers live in row.driver_results[].
  // We flatten both shapes into a single ParsedDriver[] list, using the
  // driver's own fields where available and falling back to the team row.
  const toParsedDriver = (
    r: any,
    team: any | null = null
  ): ParsedDriver => {
    // Helper: take driver-level value if set, else the team-level value.
    const driverOrTeam = <T>(k: string): T => (r[k] ?? team?.[k]) as T;
    const startPosRaw = driverOrTeam<number | null | undefined>("starting_position");
    const startingPosition =
      typeof startPosRaw === "number" && startPosRaw >= 0
        ? startPosRaw + 1
        : null;
    return {
      custId: r.cust_id,
      displayName: String(r.display_name ?? team?.display_name ?? ""),
      countryCode:
        typeof r.country_code === "string" && r.country_code.length === 2
          ? r.country_code.toUpperCase()
          : typeof team?.country_code === "string" && team.country_code.length === 2
            ? team.country_code.toUpperCase()
            : null,
      finishPosition:
        (typeof driverOrTeam<number>("finish_position") === "number"
          ? (driverOrTeam<number>("finish_position") as number)
          : 0) + 1,
      startingPosition,
      lapsComplete:
        typeof driverOrTeam<number>("laps_complete") === "number"
          ? (driverOrTeam<number>("laps_complete") as number)
          : 0,
      bestLapMs: tenThousandthsToMs(driverOrTeam("best_lap_time")),
      // iRacing returns -1 (not null/undefined) for unset fields, so a
      // raw `??` chain doesn't fall through. Try each candidate through
      // the converter (which rejects <=0) and pick the first real value.
      qualLapMs:
        tenThousandthsToMs(driverOrTeam("best_qual_lap_time")) ??
        tenThousandthsToMs(driverOrTeam("qual_lap_time")),
      incidents:
        typeof driverOrTeam<number>("incidents") === "number"
          ? (driverOrTeam<number>("incidents") as number)
          : 0,
      iRating:
        typeof r.newi_rating === "number" && r.newi_rating > 0
          ? r.newi_rating
          : null,
      carClassShortName:
        typeof driverOrTeam("car_class_short_name") === "string"
          ? (driverOrTeam("car_class_short_name") as string)
          : null,
      carIracingId:
        typeof driverOrTeam("car_id") === "number"
          ? (driverOrTeam("car_id") as number)
          : null,
      carName:
        typeof driverOrTeam("car_name") === "string"
          ? (driverOrTeam("car_name") as string)
          : null,
      carNumber:
        typeof team?.livery?.car_number === "string"
          ? team.livery.car_number
          : typeof r.livery?.car_number === "string"
            ? r.livery.car_number
            : null,
      reasonOut: String(driverOrTeam("reason_out") ?? "Running"),
      finishStatus: mapReasonOut(driverOrTeam("reason_out")),
    };
  };

  const drivers: ParsedDriver[] = [];
  for (const r of rows) {
    // Case 1: solo row (the row itself is a driver).
    if (typeof r?.cust_id === "number" && r.cust_id > 0) {
      drivers.push(toParsedDriver(r));
      continue;
    }
    // Case 2: team row containing nested driver_results.
    if (Array.isArray(r?.driver_results) && r.driver_results.length > 0) {
      for (const d of r.driver_results) {
        if (typeof d?.cust_id === "number" && d.cust_id > 0) {
          drivers.push(toParsedDriver(d, r));
        }
      }
    }
  }
  const maxLaps = drivers.reduce((m, d) => Math.max(m, d.lapsComplete), 0);
  return {
    kind,
    raceNumber,
    simSessionName: String(s?.simsession_name ?? ""),
    simSessionType: typeof s?.simsession_type === "number" ? s.simsession_type : 0,
    simSessionNumber: typeof s?.simsession_number === "number" ? s.simsession_number : 0,
    drivers,
    maxLaps,
  };
}

export function parseIracingEventJson(input: unknown): ParsedEvent {
  const wrapper = input as { type?: string; data?: any } | undefined;
  if (!wrapper || wrapper.type !== "event_result" || !wrapper.data) {
    throw new IracingJsonParseError(
      'Expected an iRacing event-result JSON object with { "type": "event_result", "data": {...} }'
    );
  }
  const data = wrapper.data;
  const all: any[] = Array.isArray(data.session_results) ? data.session_results : [];

  // Race sessions = simsession_type === 6, ordered by simsession_number ASC
  // (iRacing uses negative numbers for non-final sessions, 0 for the FEATURE).
  const raceSessions = all
    .filter((s) => s?.simsession_type === 6)
    .sort((a, b) => (a.simsession_number ?? 0) - (b.simsession_number ?? 0));
  // Qualify session: simsession_type === 4 (Lone Qualifying) OR === 5
  // (Open Qualifying). Real-world IEC events use Open Qualifying (type 5).
  const qualifySession = all.find(
    (s) => s?.simsession_type === 4 || s?.simsession_type === 5
  );

  const sessions: ParsedSession[] = [];
  if (qualifySession) {
    sessions.push(buildSession(qualifySession, "QUALIFY", 1));
  }
  raceSessions.forEach((s, i) => {
    sessions.push(buildSession(s, "RACE", i + 1));
  });

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
    raw: {
      rawSessionNames: all.map((s) => String(s?.simsession_name ?? "")),
    },
  };
}
