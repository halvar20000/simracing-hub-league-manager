/**
 * Team-performance parser for the iRacing race-logger JSONL produced by
 * iracing_race_logger.py (the same file Driver of the Day consumes).
 *
 * Driver of the Day needs overtakes + worst position, so it ignores lap times.
 * The stint planner wants the opposite, and only for OUR car: how each team
 * driver actually performed — laps, best, average, consistency, incidents —
 * plus every lap as a trace, so the next plan is built on measured numbers.
 *
 * The field is deliberately NOT listed; the only outside number kept is the
 * fastest lap in our car class, used as a reference line on the charts.
 *
 * Pure module (no DB, no "use server") so it can be unit-tested.
 *
 * Log events used here:
 *   session_start { track, session_name, weather:{track_temp_c, air_temp_c} }
 *   lap           { car_idx, car_number, driver, car, car_class, lap, lap_time }
 *   pit           { car_idx, car_number, driver, entry_lap, duration }
 *   incident      { car_idx, car_number, driver }
 *   session_end   { official }
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
   every line of the log is an untyped JSON record from the logger; each field
   is validated at the point of use instead. */

import type {
  RaceLogDriverRow,
  RaceLogLap,
  RaceLogStintRow,
} from "@/lib/stint-plan-state";

export interface ParsedRaceLog {
  ok: boolean;
  error: string | null;
  track: string | null;
  sessionName: string | null;
  official: boolean | null;
  trackTempC: number | null;
  airTempC: number | null;
  ownCarNumber: string | null;
  ownCarClass: string | null;
  classBestSec: number | null;
  fieldBestSec: number | null;
  drivers: RaceLogDriverRow[];
  laps: RaceLogLap[];
  stints: RaceLogStintRow[];
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

const round3 = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000;

interface LapRec {
  lap: number | null;
  sec: number;
  driver: string;
  /** Session clock at the end of the lap, in seconds (from `t_session`). */
  t: number | null;
}

interface CarAcc {
  carNumber: string | null;
  carClass: string | null;
  laps: LapRec[];
  pits: { entryLap: number | null; durationSec: number | null; driver: string }[];
  incidentsByDriver: Map<string, number>;
  best: number;
}

/** Colour slots available in the dashboard; extra drivers reuse the last one. */
const MAX_SLOTS = 6;

export function parseRaceLog(text: string, rosterNames: string[]): ParsedRaceLog {
  const empty: ParsedRaceLog = {
    ok: false,
    error: null,
    track: null,
    sessionName: null,
    official: null,
    trackTempC: null,
    airTempC: null,
    ownCarNumber: null,
    ownCarClass: null,
    classBestSec: null,
    fieldBestSec: null,
    drivers: [],
    laps: [],
    stints: [],
  };
  if (!text || text.trim() === "") return { ...empty, error: "empty log file" };

  const roster = new Set(rosterNames.map(norm).filter((n) => n !== ""));
  const cars = new Map<string, CarAcc>();

  let track: string | null = null;
  let sessionName: string | null = null;
  let official: boolean | null = null;
  let trackTempC: number | null = null;
  let airTempC: number | null = null;
  let sawAnyEvent = false;

  const carKey = (o: any): string =>
    o?.car_number != null && String(o.car_number).trim() !== ""
      ? `#${String(o.car_number).trim()}`
      : `idx${o?.car_idx ?? "?"}`;

  const getCar = (o: any): CarAcc => {
    const k = carKey(o);
    let c = cars.get(k);
    if (!c) {
      c = {
        carNumber: o?.car_number != null ? String(o.car_number).trim() : null,
        carClass: typeof o?.car_class === "string" ? o.car_class : null,
        laps: [],
        pits: [],
        incidentsByDriver: new Map(),
        best: Infinity,
      };
      cars.set(k, c);
    }
    if (!c.carClass && typeof o?.car_class === "string") c.carClass = o.car_class;
    return c;
  };

  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue; // a truncated last line shouldn't kill the whole upload
    }
    if (!o || typeof o !== "object") continue;
    sawAnyEvent = true;

    switch (o.type) {
      case "session_start": {
        if (typeof o.track === "string" && o.track.trim() !== "") track = o.track;
        if (typeof o.session_name === "string") sessionName = o.session_name;
        const w = o.weather ?? {};
        if (typeof w.track_temp_c === "number")
          trackTempC = Math.round(w.track_temp_c * 10) / 10;
        if (typeof w.air_temp_c === "number")
          airTempC = Math.round(w.air_temp_c * 10) / 10;
        break;
      }
      case "session_end": {
        if (typeof o.official === "boolean") official = o.official;
        break;
      }
      case "lap": {
        const sec = numOrNull(o.lap_time);
        if (sec == null) break;
        const car = getCar(o);
        car.laps.push({
          lap: typeof o.lap === "number" && o.lap > 0 ? o.lap : null,
          sec,
          driver: String(o.driver ?? "").trim(),
          t:
            typeof o.t_session === "number" && Number.isFinite(o.t_session)
              ? o.t_session
              : null,
        });
        if (sec < car.best) car.best = sec;
        break;
      }
      case "pit": {
        const car = getCar(o);
        car.pits.push({
          entryLap: typeof o.entry_lap === "number" ? o.entry_lap : null,
          durationSec: numOrNull(o.duration),
          driver: String(o.driver ?? "").trim(),
        });
        break;
      }
      case "incident": {
        const car = getCar(o);
        const d = norm(o.driver);
        car.incidentsByDriver.set(d, (car.incidentsByDriver.get(d) ?? 0) + 1);
        break;
      }
      default:
        break;
    }
  }

  if (!sawAnyEvent) return { ...empty, error: "no readable JSON lines" };
  const timedCars = Array.from(cars.values()).filter((c) => c.laps.length > 0);
  if (timedCars.length === 0)
    return { ...empty, error: "no lap events with lap times in this log" };

  const fieldBest = Math.min(...timedCars.map((c) => c.best));

  // --- our car: the one whose drivers appear on the plan's roster ----------
  let ownCar: CarAcc | null = null;
  if (roster.size > 0) {
    let bestHits = 0;
    for (const car of timedCars) {
      const names = new Set(car.laps.map((l) => norm(l.driver)));
      let hits = 0;
      for (const n of names) if (roster.has(n)) hits += 1;
      if (hits > bestHits) {
        bestHits = hits;
        ownCar = car;
      }
    }
  }
  if (!ownCar) {
    return {
      ...empty,
      error:
        "none of this plan's drivers appear in the log — add the team drivers to the plan, then upload again",
    };
  }

  // Fastest lap in our class (the reference line). Falls back to the field.
  const classCars = ownCar.carClass
    ? timedCars.filter((c) => c.carClass === ownCar!.carClass)
    : timedCars;
  const classBest = Math.min(...classCars.map((c) => c.best));

  // --- per-driver aggregation over OUR car only ---------------------------
  const order: string[] = []; // first-seen order, so colours are stable
  const byDriver = new Map<string, number[]>();
  for (const l of ownCar.laps) {
    const k = norm(l.driver);
    if (!byDriver.has(k)) {
      byDriver.set(k, []);
      order.push(k);
    }
    byDriver.get(k)!.push(l.sec);
  }
  const displayName = new Map<string, string>();
  for (const l of ownCar.laps) {
    if (!displayName.has(norm(l.driver))) displayName.set(norm(l.driver), l.driver);
  }
  const slotOf = new Map<string, number>();
  order.forEach((k, i) => slotOf.set(k, Math.min(i, MAX_SLOTS - 1)));

  const pitsByDriver = new Map<string, number>();
  for (const p of ownCar.pits) {
    const k = norm(p.driver);
    pitsByDriver.set(k, (pitsByDriver.get(k) ?? 0) + 1);
  }

  const drivers: RaceLogDriverRow[] = order.map((k, i) => {
    const secs = byDriver.get(k)!;
    const best = Math.min(...secs);
    // "Green" laps: within +5% of the driver's own best — drops in/out laps,
    // safety cars, offs and traffic-ruined laps.
    const green = secs.filter((s) => s <= best * 1.05);
    const p90 = percentile(green, 0.9);
    return {
      driver: displayName.get(k) ?? k,
      slot: slotOf.get(k) ?? i,
      laps: secs.length,
      bestSec: round3(best),
      avgSec: round3(secs.reduce((a, b) => a + b, 0) / secs.length),
      greenSec: round3(median(green)),
      medianSec: round3(median(secs)),
      spreadSec: round3(p90 != null ? p90 - best : null),
      incidents: ownCar!.incidentsByDriver.get(k) ?? 0,
      stints: 0, // filled in below
      pits: pitsByDriver.get(k) ?? 0,
      onRoster: roster.has(k),
    };
  });
  const driverIndex = new Map<string, number>();
  order.forEach((k, i) => driverIndex.set(k, i));

  // --- lap trace of our car ------------------------------------------------
  const numbered = ownCar.laps
    .filter((l) => l.lap != null)
    .sort((a, b) => (a.lap as number) - (b.lap as number));
  const pitLaps = new Set(
    ownCar.pits
      .map((p) => p.entryLap)
      .filter((n): n is number => typeof n === "number")
  );
  const laps: RaceLogLap[] = numbered.map((l) => ({
    lap: l.lap as number,
    sec: round3(l.sec) as number,
    d: driverIndex.get(norm(l.driver)) ?? 0,
    ...(l.t != null ? { t: Math.round(l.t * 10) / 10 } : {}),
    ...(pitLaps.has(l.lap as number) ? { pit: true } : {}),
  }));

  // --- stints of our car ---------------------------------------------------
  const stints: RaceLogStintRow[] = [];
  const carBest = numbered.length ? Math.min(...numbered.map((l) => l.sec)) : null;
  const stops = ownCar.pits
    .filter((p) => p.entryLap != null)
    .sort((a, b) => (a.entryLap ?? 0) - (b.entryLap ?? 0));
  const bounds: { end: number; pitSec: number | null }[] = stops.map((p) => ({
    end: p.entryLap as number,
    pitSec: p.durationSec == null ? null : Math.round(p.durationSec * 10) / 10,
  }));
  const lastLap = numbered.length ? (numbered[numbered.length - 1].lap as number) : 0;
  if (bounds.length === 0 || bounds[bounds.length - 1].end < lastLap) {
    bounds.push({ end: lastLap, pitSec: null });
  }
  let from = 0;
  for (const b of bounds) {
    const inStint = numbered.filter(
      (l) => (l.lap as number) > from && (l.lap as number) <= b.end
    );
    from = b.end;
    if (inStint.length === 0) continue;
    const clean = carBest ? inStint.filter((l) => l.sec <= carBest * 1.05) : inStint;
    const base = clean.length ? clean : inStint;
    // The driver with the most laps in this stint owns it (and its colour).
    const counts = new Map<string, number>();
    for (const l of inStint) {
      const k = norm(l.driver);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const mainKey =
      Array.from(counts.entries()).sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? "";
    stints.push({
      carNumber: ownCar.carNumber,
      index: stints.length + 1,
      startLap: inStint[0].lap,
      endLap: inStint[inStint.length - 1].lap,
      startSec: inStint[0].t == null ? null : Math.round(inStint[0].t),
      endSec:
        inStint[inStint.length - 1].t == null
          ? null
          : Math.round(inStint[inStint.length - 1].t as number),
      laps: inStint.length,
      drivers: Array.from(
        new Set(inStint.map((l) => l.driver).filter((n) => n !== ""))
      ),
      d: driverIndex.get(mainKey) ?? 0,
      avgSec: round3(base.reduce((s, l) => s + l.sec, 0) / base.length),
      pitSec: b.pitSec,
    });
  }
  for (const st of stints) {
    const row = drivers[st.d];
    if (row) row.stints += 1;
  }

  return {
    ok: true,
    error: null,
    track,
    sessionName,
    official,
    trackTempC,
    airTempC,
    ownCarNumber: ownCar.carNumber,
    ownCarClass: ownCar.carClass,
    classBestSec: round3(Number.isFinite(classBest) ? classBest : null),
    fieldBestSec: round3(Number.isFinite(fieldBest) ? fieldBest : null),
    drivers,
    laps,
    stints,
  };
}
