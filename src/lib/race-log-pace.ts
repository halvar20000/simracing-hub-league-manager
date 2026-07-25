/**
 * Pace/stint parser for the iRacing race-logger JSONL produced by
 * iracing_race_logger.py (the same file Driver of the Day consumes).
 *
 * Driver of the Day only needs overtakes + worst position, so it ignores lap
 * times. The stint planner wants the opposite: what the car ACTUALLY did —
 * per-driver green pace, how many stints were run, and how long the stops
 * took — so the next plan can be built on measured numbers instead of guesses.
 *
 * Pure module (no DB, no "use server") so it can be unit-tested.
 *
 * Log events used here:
 *   session_start { track, session_name, weather:{track_temp_c, air_temp_c}, drivers:[…] }
 *   lap           { car_idx, car_number, driver, car, lap, lap_time }
 *   pit           { car_idx, car_number, driver, entry_lap, duration, stop_count }
 *   incident      { car_idx, car_number, driver }
 *   session_end   { official }
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
   every line of the log is an untyped JSON record from the logger; each field
   is validated at the point of use instead. */

import type { RaceLogDriverRow, RaceLogStintRow } from "@/lib/stint-plan-state";

export interface ParsedRaceLog {
  ok: boolean;
  error: string | null;
  track: string | null;
  sessionName: string | null;
  official: boolean | null;
  trackTempC: number | null;
  airTempC: number | null;
  fieldBestSec: number | null;
  drivers: RaceLogDriverRow[];
  stints: RaceLogStintRow[];
  /** Car number the stints belong to (the plan's own car), when identified. */
  ownCarNumber: string | null;
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

const round3 = (n: number | null): number | null =>
  n == null ? null : Math.round(n * 1000) / 1000;

interface LapRec {
  lap: number | null;
  sec: number;
  driver: string;
}

interface CarAcc {
  carNumber: string | null;
  car: string | null;
  laps: LapRec[];
  pits: { entryLap: number | null; durationSec: number | null }[];
}

interface DriverAcc {
  carNumber: string | null;
  driver: string;
  car: string | null;
  secs: number[];
  incidents: number;
}

/** Cap on stored rows so a 60-car endurance log can't bloat the plan payload. */
const MAX_DRIVER_ROWS = 140;

export function parseRaceLog(text: string, rosterNames: string[]): ParsedRaceLog {
  const empty: ParsedRaceLog = {
    ok: false,
    error: null,
    track: null,
    sessionName: null,
    official: null,
    trackTempC: null,
    airTempC: null,
    fieldBestSec: null,
    drivers: [],
    stints: [],
    ownCarNumber: null,
  };
  if (!text || text.trim() === "") return { ...empty, error: "empty log file" };

  const roster = new Set(rosterNames.map(norm).filter((n) => n !== ""));
  const cars = new Map<string, CarAcc>();
  const drivers = new Map<string, DriverAcc>();

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
        track =
          typeof o.track === "string" && o.track.trim() !== "" ? o.track : track;
        sessionName =
          typeof o.session_name === "string" ? o.session_name : sessionName;
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
        const k = carKey(o);
        let car = cars.get(k);
        if (!car) {
          car = {
            carNumber:
              o.car_number != null ? String(o.car_number).trim() : null,
            car: typeof o.car === "string" ? o.car : null,
            laps: [],
            pits: [],
          };
          cars.set(k, car);
        }
        if (!car.car && typeof o.car === "string") car.car = o.car;
        const name = String(o.driver ?? "").trim();
        if (sec != null) {
          car.laps.push({
            lap: typeof o.lap === "number" && o.lap > 0 ? o.lap : null,
            sec,
            driver: name,
          });
          const dk = `${k}|${norm(name)}`;
          let d = drivers.get(dk);
          if (!d) {
            d = {
              carNumber: car.carNumber,
              driver: name,
              car: car.car,
              secs: [],
              incidents: 0,
            };
            drivers.set(dk, d);
          }
          d.secs.push(sec);
        }
        break;
      }
      case "pit": {
        const k = carKey(o);
        let car = cars.get(k);
        if (!car) {
          car = {
            carNumber:
              o.car_number != null ? String(o.car_number).trim() : null,
            car: null,
            laps: [],
            pits: [],
          };
          cars.set(k, car);
        }
        car.pits.push({
          entryLap: typeof o.entry_lap === "number" ? o.entry_lap : null,
          durationSec: numOrNull(o.duration),
        });
        break;
      }
      case "incident": {
        const k = `${carKey(o)}|${norm(o.driver)}`;
        const d = drivers.get(k);
        if (d) d.incidents += 1;
        break;
      }
      default:
        break;
    }
  }

  if (!sawAnyEvent) return { ...empty, error: "no readable JSON lines" };
  if (drivers.size === 0)
    return { ...empty, error: "no lap events with lap times in this log" };

  // --- own car: the car whose drivers appear on the plan's roster ----------
  let ownKey: string | null = null;
  if (roster.size > 0) {
    let bestHits = 0;
    for (const [k, car] of cars) {
      const names = new Set(car.laps.map((l) => norm(l.driver)));
      let hits = 0;
      for (const n of names) if (roster.has(n)) hits += 1;
      if (hits > bestHits) {
        bestHits = hits;
        ownKey = k;
      }
    }
    if (bestHits === 0) ownKey = null;
  }
  const ownCar = ownKey ? cars.get(ownKey)! : null;

  // --- per-driver pace rows ------------------------------------------------
  const fieldBest = Math.min(
    ...Array.from(drivers.values()).map((d) => Math.min(...d.secs))
  );
  const rows: RaceLogDriverRow[] = Array.from(drivers.values())
    .filter((d) => d.secs.length > 0)
    .map((d) => {
      const best = Math.min(...d.secs);
      // "Clean" pace: laps within +5% of the driver's own best — drops
      // in/out laps, safety cars, offs and traffic-ruined laps.
      const clean = d.secs.filter((s) => s <= best * 1.05);
      return {
        carNumber: d.carNumber,
        driver: d.driver,
        car: d.car,
        laps: d.secs.length,
        bestSec: round3(best),
        medianSec: round3(median(d.secs)),
        cleanSec: round3(median(clean)),
        incidents: d.incidents,
        own: roster.has(norm(d.driver)),
      };
    })
    .sort((a, b) => {
      if (a.own !== b.own) return a.own ? -1 : 1;
      return (a.bestSec ?? 1e9) - (b.bestSec ?? 1e9);
    })
    .slice(0, MAX_DRIVER_ROWS);

  // --- stints of the own car ----------------------------------------------
  const stints: RaceLogStintRow[] = [];
  if (ownCar) {
    const laps = ownCar.laps
      .filter((l) => l.lap != null)
      .sort((a, b) => (a.lap ?? 0) - (b.lap ?? 0));
    const carBest = laps.length ? Math.min(...laps.map((l) => l.sec)) : null;
    const stops = ownCar.pits
      .filter((p) => p.entryLap != null)
      .sort((a, b) => (a.entryLap ?? 0) - (b.entryLap ?? 0));
    // Boundaries: each pit entry closes a stint; the flag closes the last one.
    const bounds: { end: number; pitSec: number | null }[] = stops.map((p) => ({
      end: p.entryLap as number,
      pitSec: p.durationSec == null ? null : Math.round(p.durationSec * 10) / 10,
    }));
    const lastLap = laps.length ? (laps[laps.length - 1].lap as number) : 0;
    if (bounds.length === 0 || bounds[bounds.length - 1].end < lastLap) {
      bounds.push({ end: lastLap, pitSec: null });
    }
    let from = 0;
    bounds.forEach((b, i) => {
      const inStint = laps.filter(
        (l) => (l.lap as number) > from && (l.lap as number) <= b.end
      );
      if (inStint.length > 0) {
        const clean = carBest
          ? inStint.filter((l) => l.sec <= carBest * 1.05)
          : inStint;
        const base = clean.length ? clean : inStint;
        stints.push({
          carNumber: ownCar.carNumber,
          index: stints.length + 1,
          startLap: inStint[0].lap,
          endLap: inStint[inStint.length - 1].lap,
          laps: inStint.length,
          drivers: Array.from(
            new Set(inStint.map((l) => l.driver).filter((n) => n !== ""))
          ),
          avgSec: round3(base.reduce((s, l) => s + l.sec, 0) / base.length),
          pitSec: b.pitSec,
        });
      }
      from = b.end;
      void i;
    });
  }

  return {
    ok: true,
    error: null,
    track,
    sessionName,
    official,
    trackTempC,
    airTempC,
    fieldBestSec: round3(Number.isFinite(fieldBest) ? fieldBest : null),
    drivers: rows,
    stints,
    ownCarNumber: ownCar?.carNumber ?? null,
  };
}
