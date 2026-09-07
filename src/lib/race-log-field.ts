/**
 * The WHOLE FIELD, out of the same race-logger .jsonl.
 *
 * `race-log-pace.ts` deliberately keeps only our own car — it answers "how did
 * our drivers do". This module answers the other half of every de-briefing:
 * were we slow, or was everybody slow? The logger records every car in the
 * session, so the reference is already in the file we upload; until now it was
 * thrown away at parse time except for a single fastest lap.
 *
 * The pace rules are NOT re-invented here. Formation lap, start lap, in/out
 * laps, full-course yellows and restarts are marked with the very same
 * functions our own car goes through (`markExcludedLaps`), so "median clean
 * lap" means the same thing in our row as in a rival's. A benchmark computed
 * by different rules than the thing it benchmarks is worse than no benchmark.
 *
 * Two honesties are wired into the types and must survive every future edit:
 *
 *   • The lap TRACE is lossy. The logger only sees a car while our client is
 *     in the session and iRacing only publishes a lap when it feels like it —
 *     measured on Sebring 05/09: 80–100 % of the real laps per car. So laps,
 *     positions and incidents come from `session_end.final` (identical to the
 *     official result for all 37 cars there), and the trace is used only for
 *     pace, which is a median and does not care about a missing sample.
 *   • The driver name is FROZEN at session start. In a team event every lap of
 *     a car carries whoever sat in it when the log opened — our own car #84
 *     shows "Andreas Leberer" for all 91 laps although two drivers shared it.
 *     Therefore this module reports per CAR, never per driver. Per-driver
 *     figures for foreign teams come from the eventresult, or from the
 *     logger's `driver_change` event once it ships.
 *
 * Pure module: no DB, no "use server", no React.
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
   every line of the log is an untyped JSON record; validated at point of use. */

import {
  cautionWindows,
  markExcludedLaps,
  type CautionWindow,
  type LapRec,
} from "@/lib/race-log-pace";
import { median, percentile } from "@/lib/race-log-model";

/** Bumped whenever the numbers below change, so a cached model can be spotted
 *  and re-parsed instead of quietly comparing apples to last month's oranges. */
export const FIELD_MODEL_GENERATION = 1;

/**
 * Shortest pit `duration` that counts as a real stop.
 *
 * Below this the log is showing a drive-through, a serve-through penalty or a
 * car rolling down the pit lane — Sebring 05/09 has 416 pit events of which
 * well under half are stops. Counting those as stops would make a clean team
 * look like it lived in the box.
 */
export const PIT_STOP_MIN_SEC = 20;

/** Width of one pace window, in seconds. Ten minutes is long enough to hold
 *  several laps of every class and short enough to show track evolution. */
export const WINDOW_SEC = 600;

/** Fewest clean laps a CLASS window needs before its median is reported. */
const CLASS_WINDOW_MIN_LAPS = 5;

/** Fewest clean laps ONE CAR needs in a window. Lower on purpose: ten minutes
 *  hold barely five laps at Sebring and one of them is usually an in- or
 *  out-lap, so a threshold of five would blank out most of a car's own row and
 *  leave nothing to compare against the class line. */
const CAR_WINDOW_MIN_LAPS = 3;

/** Fewest clean laps a car needs before its median pace is reported. */
const CAR_MIN_CLEAN_LAPS = 5;

export type FieldCar = {
  carIdx: number;
  carNumber: string | null;
  /** Team name in a team event, driver name in a solo race. */
  team: string | null;
  carClass: string | null;
  /** The name the logger saw at session start — NOT who drove the stints. */
  startDriver: string | null;
  /** Team iRating as the session started, when the logger recorded it. */
  iRating: number | null;
  // --- from session_end.final: authoritative, matches the official result ---
  finalLaps: number | null;
  finishPos: number | null;
  finishClassPos: number | null;
  incidents: number | null;
  reasonOut: string | null;
  // --- from the lap trace: pace only ---------------------------------------
  /** Distinct numbered laps captured in the trace. Always <= finalLaps —
   *  compare the two to see how much of this car the log actually saw. */
  loggedLaps: number;
  bestSec: number | null;
  /** Median of the racing laps — the number to compare teams on. */
  cleanSec: number | null;
  cleanLaps: number;
  /** p90 minus the median of the racing laps — the spread, robust against the
   *  one lap somebody spent in the gravel. A standard deviation would be
   *  dominated by that lap and read as "inconsistent team". */
  spreadSec: number | null;
  /** Median clean lap per WINDOW_SEC window; null where the car had too few. */
  windows: (number | null)[];
  // --- pit work ------------------------------------------------------------
  stops: number;
  pitMedianSec: number | null;
  pitTotalSec: number | null;
  /** Pit events below PIT_STOP_MIN_SEC — drive-throughs, not stops. */
  shortPits: number;
  /** Black flags and the like the logger saw for this car. */
  penalties: number;
};

export type FieldClass = {
  name: string;
  cars: number;
  bestSec: number | null;
  /** Median over the cars' own median laps — the class reference. */
  cleanSec: number | null;
  /** Median stop of the class, over every real stop in it. */
  pitMedianSec: number | null;
  /** Class reference per window, over the clean laps of every car in it. */
  windows: (number | null)[];
};

export type FieldModel = {
  gen: number;
  track: string | null;
  trackConfig: string | null;
  sessionName: string | null;
  sessionNum: number | null;
  sessionUniqueId: number | null;
  official: boolean | null;
  /** Wall clock of session_start, ISO, as the logging PC saw it. */
  startedAt: string | null;
  /** Session clock of the last event — the length of the log. */
  endSec: number;
  /** Number of windows every `windows` array carries. */
  windowCount: number;
  windowSec: number;
  cautions: CautionWindow[];
  classes: FieldClass[];
  cars: FieldCar[];
};

export type FieldParseResult = {
  ok: boolean;
  error: string | null;
  model: FieldModel | null;
};

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const round3 = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000;
const strOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

interface Acc {
  carIdx: number;
  carNumber: string | null;
  team: string | null;
  carClass: string | null;
  startDriver: string | null;
  iRating: number | null;
  laps: LapRec[];
  pits: { entryLap: number | null; durationSec: number | null }[];
  penalties: number;
}

/**
 * Parse a race-logger .jsonl into per-car and per-class figures.
 *
 * Never throws on a malformed line: a truncated last line (the logger was
 * killed with the sim still running) must not cost the whole race.
 */
export function parseFieldLog(text: string): FieldParseResult {
  if (!text || text.trim() === "")
    return { ok: false, error: "empty log file", model: null };

  const cars = new Map<number, Acc>();
  const flagEvents: { flag: string; t: number }[] = [];
  let track: string | null = null;
  let trackConfig: string | null = null;
  let sessionName: string | null = null;
  let sessionNum: number | null = null;
  let sessionUniqueId: number | null = null;
  let official: boolean | null = null;
  let startedAt: string | null = null;
  let lastEventT = 0;
  let sawAny = false;
  let final: any[] = [];

  const get = (idx: number): Acc => {
    let a = cars.get(idx);
    if (!a) {
      a = {
        carIdx: idx,
        carNumber: null,
        team: null,
        carClass: null,
        startDriver: null,
        iRating: null,
        laps: [],
        pits: [],
        penalties: 0,
      };
      cars.set(idx, a);
    }
    return a;
  };

  for (const line of text.split("\n")) {
    const s = line.trim();
    if (s === "" || s[0] !== "{") continue;
    let o: any;
    try {
      o = JSON.parse(s);
    } catch {
      continue;
    }
    if (!o || typeof o !== "object") continue;
    sawAny = true;
    if (typeof o.t_session === "number" && Number.isFinite(o.t_session)) {
      if (o.t_session > lastEventT) lastEventT = o.t_session;
    }
    const idx = typeof o.car_idx === "number" ? o.car_idx : null;

    switch (o.type) {
      case "session_start": {
        track = strOrNull(o.track);
        trackConfig = strOrNull(o.track_config);
        sessionName = strOrNull(o.session_name);
        sessionNum = typeof o.session_num === "number" ? o.session_num : null;
        sessionUniqueId =
          typeof o.session_unique_id === "number" ? o.session_unique_id : null;
        startedAt = strOrNull(o.t_wall);
        for (const d of Array.isArray(o.drivers) ? o.drivers : []) {
          if (typeof d?.car_idx !== "number") continue;
          const a = get(d.car_idx);
          a.carNumber = strOrNull(d.car_number);
          // A solo entry has no team; the driver's own name is the entry then.
          a.team = strOrNull(d.team) ?? strOrNull(d.name);
          a.carClass = strOrNull(d.car_class);
          a.startDriver = strOrNull(d.name);
          a.iRating = typeof d.irating === "number" ? d.irating : null;
        }
        break;
      }
      case "session_end": {
        if (typeof o.official === "boolean") official = o.official;
        if (Array.isArray(o.final)) final = o.final;
        break;
      }
      case "flag": {
        const t =
          typeof o.t_session === "number" && Number.isFinite(o.t_session)
            ? o.t_session
            : null;
        const f = strOrNull(o.flag);
        if (t != null && f) flagEvents.push({ flag: f, t });
        break;
      }
      case "lap": {
        // A lap with no time is the logger seeing a car it cannot time yet
        // (in the garage, not in the world). Sebring 05/09: car #77 alone
        // produced 497 of them with lap = -1. They carry nothing.
        const sec = numOrNull(o.lap_time);
        if (sec == null || idx == null) break;
        const a = get(idx);
        if (!a.carNumber) a.carNumber = strOrNull(o.car_number);
        if (!a.carClass) a.carClass = strOrNull(o.car_class);
        a.laps.push({
          lap: typeof o.lap === "number" && o.lap > 0 ? o.lap : null,
          sec,
          driver: String(o.driver ?? "").trim(),
          t:
            typeof o.t_session === "number" && Number.isFinite(o.t_session)
              ? o.t_session
              : null,
          onPit: o.on_pit === true,
        });
        break;
      }
      case "pit": {
        if (idx == null) break;
        const a = get(idx);
        a.pits.push({
          entryLap: typeof o.entry_lap === "number" ? o.entry_lap : null,
          durationSec: numOrNull(o.duration),
        });
        break;
      }
      case "penalty": {
        if (idx == null) break;
        get(idx).penalties += 1;
        break;
      }
      default:
        break;
    }
  }

  if (!sawAny) return { ok: false, error: "no readable JSON lines", model: null };
  if (cars.size === 0)
    return { ok: false, error: "no cars in this log", model: null };

  const greenAtSec = flagEvents.find((f) => f.flag === "green")?.t ?? null;
  const cautions = cautionWindows(flagEvents, lastEventT);
  const windowCount = Math.max(1, Math.ceil(lastEventT / WINDOW_SEC));
  const windowOf = (t: number | null): number | null => {
    if (t == null || !Number.isFinite(t) || t < 0) return null;
    return Math.min(windowCount - 1, Math.floor(t / WINDOW_SEC));
  };

  const finalByIdx = new Map<number, any>();
  for (const f of final) {
    if (typeof f?.car_idx === "number") finalByIdx.set(f.car_idx, f);
  }

  /** Clean laps per car, kept for the class windows below. */
  const cleanByCar = new Map<number, { sec: number; w: number | null }[]>();

  const out: FieldCar[] = [];
  for (const a of cars.values()) {
    // One entry per lap NUMBER. The logger re-reports a lap it has already
    // seen (Sebring 05/09: car #294 sent 143 lap events for 92 laps, #77 sent
    // 524), and a duplicate would be counted twice in every median below.
    // Laps with no number are dropped entirely: they cannot be placed in the
    // race, so they can be neither excluded as an in-lap nor trusted as a best.
    const seenLap = new Set<number>();
    const numbered = a.laps
      .filter((l) => l.lap != null)
      .sort((x, y) => (x.lap as number) - (y.lap as number))
      .filter((l) => {
        const n = l.lap as number;
        if (seenLap.has(n)) return false;
        seenLap.add(n);
        return true;
      });
    const inLaps = new Set<number>();
    for (const p of a.pits) if (p.entryLap != null) inLaps.add(p.entryLap);
    for (const l of numbered) if (l.onPit && l.lap != null) inLaps.add(l.lap);
    const excluded = markExcludedLaps(numbered, inLaps, greenAtSec, cautions);

    const clean = numbered.filter(
      (l) => l.lap != null && !excluded.has(l.lap as number)
    );
    const cleanSecs = clean.map((l) => l.sec);
    // The MID of the lap decides its window: a lap spans [t − sec, t].
    const cleanRecs = clean.map((l) => ({
      sec: l.sec,
      w: windowOf(l.t == null ? null : l.t - l.sec / 2),
    }));
    cleanByCar.set(a.carIdx, cleanRecs);

    const windows: (number | null)[] = new Array(windowCount).fill(null);
    for (let w = 0; w < windowCount; w += 1) {
      const xs = cleanRecs.filter((r) => r.w === w).map((r) => r.sec);
      windows[w] = xs.length >= CAR_WINDOW_MIN_LAPS ? round3(median(xs)) : null;
    }

    const stops = a.pits
      .map((p) => p.durationSec)
      .filter((d): d is number => d != null && d >= PIT_STOP_MIN_SEC);
    const shortPits = a.pits.length - stops.length;
    const f = finalByIdx.get(a.carIdx);
    const traceSecs = numbered.map((l) => l.sec);
    // iRacing's own best beats ours: it saw the laps the logger missed.
    const officialBest = numOrNull(f?.best_lap);
    const cleanMed = median(cleanSecs);
    const cleanP90 = percentile(cleanSecs, 0.9);

    out.push({
      carIdx: a.carIdx,
      carNumber: a.carNumber,
      team: a.team,
      carClass: a.carClass,
      startDriver: a.startDriver,
      iRating: a.iRating,
      finalLaps: typeof f?.laps_completed === "number" ? f.laps_completed : null,
      finishPos: typeof f?.position === "number" ? f.position : null,
      finishClassPos:
        typeof f?.class_position === "number" ? f.class_position : null,
      incidents: typeof f?.incidents === "number" ? f.incidents : null,
      reasonOut: strOrNull(f?.reason_out),
      loggedLaps: numbered.length,
      bestSec:
        officialBest != null
          ? round3(officialBest)
          : traceSecs.length
            ? round3(Math.min(...traceSecs))
            : null,
      cleanSec:
        cleanSecs.length >= CAR_MIN_CLEAN_LAPS ? round3(cleanMed) : null,
      cleanLaps: cleanSecs.length,
      spreadSec:
        cleanSecs.length >= CAR_MIN_CLEAN_LAPS && cleanMed != null && cleanP90 != null
          ? round3(cleanP90 - cleanMed)
          : null,
      windows,
      stops: stops.length,
      pitMedianSec: stops.length ? round3(median(stops)) : null,
      pitTotalSec: stops.length
        ? round3(stops.reduce((x, y) => x + y, 0))
        : null,
      shortPits,
      penalties: a.penalties,
    });
  }

  out.sort((x, y) => {
    const px = x.finishPos ?? 9999;
    const py = y.finishPos ?? 9999;
    if (px !== py) return px - py;
    return (x.carNumber ?? "").localeCompare(y.carNumber ?? "");
  });

  // --- per class -----------------------------------------------------------
  const classNames = Array.from(
    new Set(out.map((c) => c.carClass).filter((n): n is string => !!n))
  );
  const classes: FieldClass[] = classNames.map((name) => {
    const members = out.filter((c) => c.carClass === name);
    const bests = members
      .map((c) => c.bestSec)
      .filter((x): x is number => x != null);
    const meds = members
      .map((c) => c.cleanSec)
      .filter((x): x is number => x != null);
    const stops: number[] = [];
    for (const m of members) {
      if (m.pitMedianSec != null) {
        // Weight a team by its own median rather than by how often it stopped:
        // a car with 34 stops must not define the class's pit benchmark.
        stops.push(m.pitMedianSec);
      }
    }
    const windows: (number | null)[] = new Array(windowCount).fill(null);
    for (let w = 0; w < windowCount; w += 1) {
      const xs: number[] = [];
      for (const m of members) {
        const recs = cleanByCar.get(m.carIdx) ?? [];
        for (const r of recs) if (r.w === w) xs.push(r.sec);
      }
      windows[w] = xs.length >= CLASS_WINDOW_MIN_LAPS ? round3(median(xs)) : null;
    }
    return {
      name,
      cars: members.length,
      bestSec: bests.length ? round3(Math.min(...bests)) : null,
      cleanSec: meds.length ? round3(median(meds)) : null,
      pitMedianSec: stops.length ? round3(median(stops)) : null,
      windows,
    };
  });

  return {
    ok: true,
    error: null,
    model: {
      gen: FIELD_MODEL_GENERATION,
      track,
      trackConfig,
      sessionName,
      sessionNum,
      sessionUniqueId,
      official,
      startedAt,
      endSec: Math.round(lastEventT),
      windowCount,
      windowSec: WINDOW_SEC,
      cautions,
      classes,
      cars: out,
    },
  };
}
