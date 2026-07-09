/**
 * Parser for the iRacing race-logger JSONL ("log.jsonl") produced by
 * iracing_race_logger.py in the iRacing-overlays project.
 *
 * For Driver of the Day, the authoritative start / finish / incident numbers
 * come from the iRacing eventresult JSON (see src/lib/iracing-json.ts). The log
 * supplies the two things eventresult does NOT contain:
 *
 *   • overtakes      — the logger's cumulative on-track-pass counter
 *   • worst position — the lowest track position a driver fell to, used for the
 *                      "recovery" metric (worst → finish)
 *
 * This module is pure (no DB, no "use server") so it can be unit-tested and
 * reused by both the server action and any future cron.
 *
 * Log event shapes used here (other event types are ignored):
 *   session_start { type, track, track_config, drivers: [{ car_idx, car_number, name, ... }] }
 *   lap           { type, car_idx, car_number, driver, position, overtakes, overtaken }
 *   session_end   { type, official, final: [{ car_idx, car_number, driver, position, ... }] }
 */

export interface DotdLogDriver {
  carIdx: number;
  carNumber: string | null;
  name: string;
  overtakes: number;
  overtaken: number;
  /** Max (worst) track position seen across lap events (> 0), or null. */
  worstPosition: number | null;
  /** First valid lap position — a fallback grid proxy if eventresult lacks one. */
  startPositionFromLog: number | null;
  sawLaps: boolean;
}

export interface ParsedDotdLog {
  ok: boolean;
  error: string | null;
  track: string | null;
  trackConfig: string | null;
  official: boolean | null;
  /** iRacing SessionNum from session_start — matches eventresult simSessionNumber. */
  sessionNum: number | null;
  /** iRacing SessionUniqueID — same across heats of one subsession. */
  sessionUniqueId: number | null;
  /** e.g. "RACE", "HEAT 1", "FEATURE". */
  sessionName: string | null;
  drivers: DotdLogDriver[];
  /** Keyed by trimmed car number (e.g. "89"). */
  byCarNumber: Map<string, DotdLogDriver>;
  /** Keyed by normalised display name (trimmed, lower-cased). */
  byName: Map<string, DotdLogDriver>;
}

export function normalizeName(name: unknown): string {
  return String(name ?? "").trim().toLowerCase();
}

export function normalizeCarNumber(n: unknown): string | null {
  if (n === null || n === undefined) return null;
  const s = String(n).trim();
  return s.length === 0 ? null : s;
}

interface Acc {
  carIdx: number;
  carNumber: string | null;
  name: string;
  overtakes: number;
  overtaken: number;
  worstPosition: number | null;
  startPositionFromLog: number | null;
  sawLaps: boolean;
}

export function parseDotdLog(text: string): ParsedDotdLog {
  const empty: ParsedDotdLog = {
    ok: false,
    error: null,
    track: null,
    trackConfig: null,
    official: null,
    sessionNum: null,
    sessionUniqueId: null,
    sessionName: null,
    drivers: [],
    byCarNumber: new Map(),
    byName: new Map(),
  };

  if (!text || text.trim().length === 0) {
    return { ...empty, error: "empty log file" };
  }

  const acc = new Map<number, Acc>();
  const get = (idx: number): Acc => {
    let a = acc.get(idx);
    if (!a) {
      a = {
        carIdx: idx,
        carNumber: null,
        name: "",
        overtakes: 0,
        overtaken: 0,
        worstPosition: null,
        startPositionFromLog: null,
        sawLaps: false,
      };
      acc.set(idx, a);
    }
    return a;
  };

  let sawSessionStart = false;
  let sawSessionEnd = false;
  let track: string | null = null;
  let trackConfig: string | null = null;
  let official: boolean | null = null;
  let sessionNum: number | null = null;
  let sessionUniqueId: number | null = null;
  let sessionName: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // skip bad lines, like the Python loader
    }
    const t = e["type"];

    if (t === "session_start") {
      sawSessionStart = true;
      if (typeof e["track"] === "string") track = e["track"] as string;
      if (typeof e["track_config"] === "string") trackConfig = e["track_config"] as string;
      if (typeof e["session_num"] === "number") sessionNum = e["session_num"] as number;
      if (typeof e["session_unique_id"] === "number") sessionUniqueId = e["session_unique_id"] as number;
      if (typeof e["session_name"] === "string") sessionName = e["session_name"] as string;
      const drivers = Array.isArray(e["drivers"]) ? (e["drivers"] as unknown[]) : [];
      for (const d of drivers) {
        const dd = d as Record<string, unknown>;
        if (typeof dd["car_idx"] !== "number") continue;
        const a = get(dd["car_idx"] as number);
        const cn = normalizeCarNumber(dd["car_number"]);
        if (cn) a.carNumber = cn;
        if (typeof dd["name"] === "string" && dd["name"]) a.name = dd["name"] as string;
      }
    } else if (t === "session_end") {
      sawSessionEnd = true;
      if (typeof e["official"] === "boolean") official = e["official"] as boolean;
      const fin = Array.isArray(e["final"]) ? (e["final"] as unknown[]) : [];
      for (const f of fin) {
        const ff = f as Record<string, unknown>;
        if (typeof ff["car_idx"] !== "number") continue;
        const a = get(ff["car_idx"] as number);
        const cn = normalizeCarNumber(ff["car_number"]);
        if (cn) a.carNumber = cn;
        if (typeof ff["driver"] === "string" && ff["driver"]) a.name = ff["driver"] as string;
      }
    } else if (t === "lap") {
      if (typeof e["car_idx"] !== "number") continue;
      const a = get(e["car_idx"] as number);
      a.sawLaps = true;
      const cn = normalizeCarNumber(e["car_number"]);
      if (cn) a.carNumber = cn;
      if (typeof e["driver"] === "string" && e["driver"]) a.name = e["driver"] as string;
      if (typeof e["overtakes"] === "number") a.overtakes = Math.max(a.overtakes, e["overtakes"] as number);
      if (typeof e["overtaken"] === "number") a.overtaken = Math.max(a.overtaken, e["overtaken"] as number);
      const pos = e["position"];
      if (typeof pos === "number" && Number.isInteger(pos) && pos > 0) {
        a.worstPosition = a.worstPosition === null ? pos : Math.max(a.worstPosition, pos);
        if (a.startPositionFromLog === null) a.startPositionFromLog = pos;
      }
    }
  }

  if (!sawSessionStart && !sawSessionEnd && acc.size === 0) {
    return { ...empty, error: "no recognisable race-logger events in file" };
  }

  const drivers: DotdLogDriver[] = [...acc.values()].map((a) => ({
    carIdx: a.carIdx,
    carNumber: a.carNumber,
    name: a.name,
    overtakes: a.overtakes,
    overtaken: a.overtaken,
    worstPosition: a.worstPosition,
    startPositionFromLog: a.startPositionFromLog,
    sawLaps: a.sawLaps,
  }));

  const byCarNumber = new Map<string, DotdLogDriver>();
  const byName = new Map<string, DotdLogDriver>();
  for (const d of drivers) {
    if (d.carNumber) byCarNumber.set(d.carNumber, d);
    const nn = normalizeName(d.name);
    if (nn) byName.set(nn, d);
  }

  return {
    ok: true,
    error: null,
    track,
    trackConfig,
    official,
    sessionNum,
    sessionUniqueId,
    sessionName,
    drivers,
    byCarNumber,
    byName,
  };
}
