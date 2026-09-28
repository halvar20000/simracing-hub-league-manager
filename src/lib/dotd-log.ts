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
 * The worst position is PIT-CYCLE ADJUSTED (v2.35.0). While the field is on
 * different numbers of stops the running order says who has pitted, not who
 * is faster: an early stopper falls back and "gets the places back" once the
 * others come in — that used to be scored as recovery. Positions sampled
 * inside a pit-cycle window (`pitCycleWindows` in race-log-field.ts, the same
 * stop definition the de-briefing uses) and on a car's own pit laps are
 * ignored. Logs without session times fall back to skipping only the car's
 * own in- and out-laps.
 *
 * This module is pure (no DB, no "use server") so it can be unit-tested and
 * reused by both the server action and any future cron.
 *
 * Log event shapes used here (other event types are ignored):
 *   session_start { type, track, track_config, drivers: [{ car_idx, car_number, name, ... }] }
 *   lap           { type, car_idx, car_number, driver, position, overtakes, overtaken, lap, on_pit, t_session }
 *   pit           { type, car_idx, entry_lap, duration, t_session }   (emitted at pit exit)
 *   session_end   { type, official, final: [{ car_idx, car_number, driver, position, ... }] }
 */

import {
  PIT_STOP_MIN_SEC as PIT_MIN,
  inPitCycle,
  pitCycleWindows,
  realStopSpans,
  type PitCycleWindow,
  type StopSpan,
} from "@/lib/race-log-field";

/** How the worst position was cleaned of pit-stop reshuffles. */
export type DotdPitAdjust =
  /** Field-wide pit-cycle windows skipped (needs session times in the log). */
  | "field"
  /** Old log without session times: only the car's own in/out laps skipped. */
  | "own-laps"
  /** Nobody made a real stop — nothing to adjust. */
  | "none";

/** Fallback lap length when the log holds too few timed laps to measure one. */
const DEFAULT_SETTLE_SEC = 120;

export interface DotdLogDriver {
  carIdx: number;
  carNumber: string | null;
  name: string;
  overtakes: number;
  overtaken: number;
  /** Worst track position OUTSIDE pit cycles and own pit laps (> 0), or null
   *  when no lap survived the filter (→ recovery 0). */
  worstPosition: number | null;
  /** Worst track position over every lap, stops included — for transparency. */
  worstPositionRaw: number | null;
  /** Real stops (≥ PIT_STOP_MIN_SEC) the log saw for this car. */
  stops: number;
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
  /** How worst positions were adjusted for pit stops. */
  pitAdjust: DotdPitAdjust;
  /** The windows that were skipped (empty unless pitAdjust === "field"). */
  pitWindows: PitCycleWindow[];
  /** Keyed by trimmed car number (e.g. "89"). */
  byCarNumber: Map<string, DotdLogDriver>;
  /** Keyed by normalised display name (trimmed, lower-cased). */
  byName: Map<string, DotdLogDriver>;
}

function medianOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
  startPositionFromLog: number | null;
  sawLaps: boolean;
  samples: { lap: number | null; t: number | null; pos: number; onPit: boolean }[];
  pits: { tSec: number | null; durationSec: number | null; entryLap: number | null }[];
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
    pitAdjust: "none",
    pitWindows: [],
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
        startPositionFromLog: null,
        sawLaps: false,
        samples: [],
        pits: [],
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
  const lapTimes: number[] = [];

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
        if (a.startPositionFromLog === null) a.startPositionFromLog = pos;
        const ts = e["t_session"];
        const lapNo = e["lap"];
        a.samples.push({
          lap: typeof lapNo === "number" && lapNo > 0 ? lapNo : null,
          t: typeof ts === "number" && Number.isFinite(ts) ? ts : null,
          pos,
          onPit: e["on_pit"] === true,
        });
      }
      const lt = e["lap_time"];
      if (typeof lt === "number" && Number.isFinite(lt) && lt > 0 && e["on_pit"] !== true) {
        lapTimes.push(lt);
      }
    } else if (t === "pit") {
      if (typeof e["car_idx"] !== "number") continue;
      const a = get(e["car_idx"] as number);
      const ts = e["t_session"];
      const du = e["duration"];
      const el = e["entry_lap"];
      a.pits.push({
        tSec: typeof ts === "number" && Number.isFinite(ts) ? ts : null,
        durationSec: typeof du === "number" && Number.isFinite(du) ? du : null,
        entryLap: typeof el === "number" ? el : null,
      });
    }
  }

  if (!sawSessionStart && !sawSessionEnd && acc.size === 0) {
    return { ...empty, error: "no recognisable race-logger events in file" };
  }

  // --- pit-cycle adjustment of the worst position ---------------------------
  const cars = [...acc.values()];
  const isRealStop = (p: Acc["pits"][number]): boolean =>
    p.durationSec != null && p.durationSec >= PIT_MIN;
  const anyStops = cars.some((a) => a.pits.some(isRealStop));
  const timed =
    cars.every((a) => a.samples.every((x) => x.t != null)) &&
    cars.every((a) => a.pits.every((p) => !isRealStop(p) || p.tSec != null));
  const pitAdjust: DotdPitAdjust = !anyStops ? "none" : timed ? "field" : "own-laps";
  const settleSec = medianOf(lapTimes) ?? DEFAULT_SETTLE_SEC;
  const pitWindows: PitCycleWindow[] =
    pitAdjust === "field"
      ? pitCycleWindows(
          cars.map((a): StopSpan[] => realStopSpans(a.pits)),
          settleSec
        )
      : [];

  const worstOf = (xs: { pos: number }[]): number | null =>
    xs.length === 0 ? null : xs.reduce((m, x) => Math.max(m, x.pos), 0);

  const drivers: DotdLogDriver[] = cars.map((a) => {
    let kept = a.samples;
    if (pitAdjust === "field") {
      kept = a.samples.filter((x) => !x.onPit && !inPitCycle(x.t as number, pitWindows));
    } else if (pitAdjust === "own-laps") {
      const skip = new Set<number>();
      for (const p of a.pits) {
        if (p.entryLap == null || !isRealStop(p)) continue;
        skip.add(p.entryLap);
        skip.add(p.entryLap + 1);
      }
      kept = a.samples.filter((x) => !x.onPit && !(x.lap != null && skip.has(x.lap)));
    }
    return {
      carIdx: a.carIdx,
      carNumber: a.carNumber,
      name: a.name,
      overtakes: a.overtakes,
      overtaken: a.overtaken,
      worstPosition: worstOf(kept),
      worstPositionRaw: worstOf(a.samples),
      stops: a.pits.filter(isRealStop).length,
      startPositionFromLog: a.startPositionFromLog,
      sawLaps: a.sawLaps,
    };
  });

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
    pitAdjust,
    pitWindows,
    byCarNumber,
    byName,
  };
}
