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
  const drivers: ParsedDriver[] = rows
    .filter((r) => typeof r?.cust_id === "number" && r.cust_id > 0)
    .map((r) => {
      const startPosRaw = r.starting_position;
      const startingPosition =
        typeof startPosRaw === "number" && startPosRaw >= 0
          ? startPosRaw + 1
          : null;
      return {
        custId: r.cust_id,
        displayName: String(r.display_name ?? ""),
        countryCode: typeof r.country_code === "string" && r.country_code.length === 2
          ? r.country_code.toUpperCase()
          : null,
        finishPosition: (typeof r.finish_position === "number" ? r.finish_position : 0) + 1,
        startingPosition,
        lapsComplete: typeof r.laps_complete === "number" ? r.laps_complete : 0,
        bestLapMs: tenThousandthsToMs(r.best_lap_time),
        qualLapMs: tenThousandthsToMs(r.qual_lap_time ?? r.best_qual_lap_time),
        incidents: typeof r.incidents === "number" ? r.incidents : 0,
        iRating: typeof r.newi_rating === "number" && r.newi_rating > 0 ? r.newi_rating : null,
        carClassShortName:
          typeof r.car_class_short_name === "string" ? r.car_class_short_name : null,
        carIracingId: typeof r.car_id === "number" ? r.car_id : null,
        carName: typeof r.car_name === "string" ? r.car_name : null,
        carNumber: typeof r.livery?.car_number === "string" ? r.livery.car_number : null,
        reasonOut: String(r.reason_out ?? "Running"),
        finishStatus: mapReasonOut(r.reason_out),
      };
    });
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
  // Qualify session = simsession_type === 4 (only one expected per event).
  const qualifySession = all.find((s) => s?.simsession_type === 4);

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
