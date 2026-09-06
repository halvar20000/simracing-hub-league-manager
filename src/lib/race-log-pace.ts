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
  LapExclusion,
  RaceLogDriverRow,
  RaceLogLap,
  RaceLogStintRow,
} from "@/lib/stint-plan-state";

/** Bumped whenever the exclusion rules change, so a plan carrying an older
 *  trace can be spotted and offered a re-analyse. */
export const PARSER_EXCLUSION_GENERATION = 2;

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
  /** Periodic track-temperature samples, `t` = session clock. Empty for a log
   *  written before the logger sampled them. */
  temps: { t: number; c: number }[];
  /** See PlannerRaceLog.exclV. */
  exclV: number;
  /** See PlannerRaceLog.incidentSource. */
  incidentSource: "dashboard" | "sdk" | "none" | null;
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
  /** Session clock at the END of the lap, in seconds (from `t_session`).
   *  The lap therefore spans [t − sec, t]. */
  t: number | null;
  /** The logger saw the car on pit road during this lap — a direct in-lap
   *  marker, independent of the pit events. */
  onPit: boolean;
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

/** A full-course-yellow window on the session clock, [from, to]. */
interface CautionWindow {
  from: number;
  to: number;
}

/**
 * Full-course yellows, from the race-control flags.
 *
 * ONLY `caution` (iRacing raw bit 16384) opens a window and only `green`
 * closes it. `yellow` / `yellow_waving` is a LOCAL flag at one corner and must
 * never be treated as a course-wide caution: iRacing throws it for a single
 * incident and frequently never follows it with a green, so "yellow until the
 * next green" would swallow the remainder of the race. That is not
 * hypothetical — the Le Mans 05/09 log has exactly one waved yellow at
 * t=846 s and no green after it, in a session running past t=3174 s.
 *
 * A caution that is never closed ran to the end of the session (the race
 * finished behind the pace car), so it closes at the last event in the log.
 */
function cautionWindows(
  flags: { flag: string; t: number }[],
  endT: number
): CautionWindow[] {
  const out: CautionWindow[] = [];
  let open: number | null = null;
  for (const f of flags) {
    if (f.flag === "caution") {
      if (open == null) open = f.t;
    } else if (f.flag === "green" && open != null) {
      if (f.t > open) out.push({ from: open, to: f.t });
      open = null;
    }
  }
  if (open != null && endT > open) out.push({ from: open, to: endT });
  return out;
}

/**
 * Track temperature while a lap ran, from the periodic samples.
 *
 * The lap spans [t − sec, t], so the temperature that matters is the one in
 * the middle of it. Samples are 30 s apart and a track moves a couple of
 * degrees an HOUR, so linear interpolation between the two neighbouring
 * samples is well inside the noise. Outside the sampled window the nearest
 * sample is used — but only within CLAMP_SEC, because a log that stopped
 * sampling an hour before the flag knows nothing about the flag.
 */
const TEMP_CLAMP_SEC = 15 * 60;

function tempAt(
  samples: { t: number; c: number }[],
  atSec: number | null
): number | null {
  if (samples.length === 0 || atSec == null || !Number.isFinite(atSec)) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (atSec <= first.t) {
    return atSec >= first.t - TEMP_CLAMP_SEC ? first.c : null;
  }
  if (atSec >= last.t) {
    return atSec <= last.t + TEMP_CLAMP_SEC ? last.c : null;
  }
  for (let i = 1; i < samples.length; i += 1) {
    const b = samples[i];
    if (b.t < atSec) continue;
    const a = samples[i - 1];
    if (b.t === a.t) return b.c;
    const f = (atSec - a.t) / (b.t - a.t);
    return Math.round((a.c + f * (b.c - a.c)) * 10) / 10;
  }
  return last.c;
}

/**
 * Which laps do not belong in an average, and why.
 *
 * Johann's rule, extended: the formation lap and the lap containing the start
 * are not racing laps, the lap into the pits and the lap back out carry the
 * stop, and a lap under a full-course yellow says nothing about pace — nor
 * does the lap on which the race goes green again, which is a restart.
 *
 * Everything is decided on the session clock (`t` is the END of a lap, so the
 * lap spans [t − sec, t]); a lap with no clock keeps only the in/out marks,
 * which are lap-number based. Returns a map keyed by lap number.
 */
function markExcludedLaps(
  numbered: LapRec[],
  inLaps: Set<number>,
  greenAtSec: number | null,
  cautions: CautionWindow[]
): Map<number, LapExclusion> {
  const marks = new Map<number, LapExclusion>();
  if (numbered.length === 0) return marks;

  // The start lap is the lap the green flag falls INSIDE — not simply the
  // first lap after it. The difference matters: iRacing frequently logs the
  // lap carrying the start without a usable lap time (it is not in `numbered`
  // at all), and "first lap ending after the green" would then throw away the
  // first proper racing lap instead. Verified on the Le Mans 05/09 log: green
  // at t=258 s, and the first timed lap runs 463→673 s — a normal lap.
  let startLapNo: number | null = null;
  if (greenAtSec != null) {
    const hit = numbered.find(
      (l) => l.t != null && l.t - l.sec <= greenAtSec && l.t > greenAtSec
    );
    startLapNo = hit?.lap ?? null;
  } else {
    // No green in the log: nothing to measure against, so drop lap 1 only.
    startLapNo = numbered.some((l) => l.lap === 1) ? 1 : null;
  }

  // The restart lap: the first lap that BEGINS after the green came back out.
  // Not "the first lap ending after it" — the lap the restart falls inside is
  // still a caution lap and is already dropped as such, so keying off the end
  // would mark a lap that was going to be dropped anyway and let the actual
  // restart lap through. Verified on the Brands Hatch caution (470→756 s):
  // laps 3-5 run under yellow, and lap 6 — 84.2 s against a 81.5 s norm,
  // still bunched up from the restart — is the one this catches.
  const restartLaps = new Set<number>();
  for (const w of cautions) {
    const first = numbered.find((l) => l.t != null && l.t - l.sec >= w.to);
    if (first?.lap != null) restartLaps.add(first.lap);
  }

  for (let i = 0; i < numbered.length; i += 1) {
    const l = numbered[i];
    if (l.lap == null) continue;
    const end = l.t;
    const start = end == null ? null : end - l.sec;

    // Order matters only for the reason shown to the user; a lap is dropped
    // either way.
    if (greenAtSec != null && end != null && end <= greenAtSec) {
      marks.set(l.lap, "form");
      continue;
    }
    if (startLapNo != null && l.lap === startLapNo) {
      marks.set(l.lap, "start");
      continue;
    }
    if (inLaps.has(l.lap) || l.onPit) {
      marks.set(l.lap, "in");
      continue;
    }
    const prev = numbered[i - 1];
    if (
      prev?.lap != null &&
      prev.lap === l.lap - 1 &&
      (inLaps.has(prev.lap) || prev.onPit)
    ) {
      marks.set(l.lap, "out");
      continue;
    }
    if (
      end != null &&
      start != null &&
      cautions.some((w) => end > w.from && start < w.to)
    ) {
      marks.set(l.lap, "fcy");
      continue;
    }
    if (restartLaps.has(l.lap)) marks.set(l.lap, "restart");
  }
  return marks;
}

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
    temps: [],
    exclV: PARSER_EXCLUSION_GENERATION,
    incidentSource: null,
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
  /** Race-control flags with their session clock, in the order they came. */
  const flagEvents: { flag: string; t: number }[] = [];
  /** Track-temperature samples, in the order they came. */
  const tempSamples: { t: number; c: number }[] = [];
  /** What the logger said about where its incidents came from. */
  let incidentSource: "dashboard" | "sdk" | "none" | null = null;
  /** Session clock of the last event of any kind — the end of the log. */
  let lastEventT = 0;

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
    if (typeof o.t_session === "number" && Number.isFinite(o.t_session)) {
      if (o.t_session > lastEventT) lastEventT = o.t_session;
    }

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
      case "incident_source": {
        const v = o.source;
        if (v === "dashboard" || v === "sdk" || v === "none") {
          // A run that starts without a dashboard and finds one later reports
          // both; the stronger source is the one that actually measured.
          if (v !== "none" || incidentSource == null) incidentSource = v;
        }
        break;
      }
      case "weather": {
        const t =
          typeof o.t_session === "number" && Number.isFinite(o.t_session)
            ? o.t_session
            : null;
        const c =
          typeof o.track_temp_c === "number" && Number.isFinite(o.track_temp_c)
            ? o.track_temp_c
            : null;
        // A track at 0 °C is the sim before it has data, not a cold night.
        if (t != null && c != null && c > 0) {
          tempSamples.push({ t: Math.round(t * 10) / 10, c: Math.round(c * 10) / 10 });
        }
        break;
      }
      case "flag": {
        const t =
          typeof o.t_session === "number" && Number.isFinite(o.t_session)
            ? o.t_session
            : null;
        const f = typeof o.flag === "string" ? o.flag : null;
        if (t != null && f) flagEvents.push({ flag: f, t });
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
          onPit: o.on_pit === true,
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
  // Which laps are not racing laps. `inLaps` is the pit-event view widened by
  // the logger's own on_pit marker — either one is proof enough that the lap
  // ended in the box.
  const inLaps = new Set<number>(pitLaps);
  for (const l of numbered) if (l.onPit && l.lap != null) inLaps.add(l.lap);
  const greenAtSec = flagEvents.find((f) => f.flag === "green")?.t ?? null;
  const cautions = cautionWindows(flagEvents, lastEventT);
  const excluded = markExcludedLaps(numbered, inLaps, greenAtSec, cautions);

  const temps = tempSamples.sort((a, b) => a.t - b.t);

  const laps: RaceLogLap[] = numbered.map((l) => {
    // Mid-lap, not lap end: a 3-minute Le Mans lap started at a measurably
    // different temperature than it finished at.
    const midSec = l.t == null ? null : l.t - l.sec / 2;
    const tc = tempAt(temps, midSec);
    return {
      lap: l.lap as number,
      sec: round3(l.sec) as number,
      d: driverIndex.get(norm(l.driver)) ?? 0,
      ...(l.t != null ? { t: Math.round(l.t * 10) / 10 } : {}),
      ...(pitLaps.has(l.lap as number) ? { pit: true } : {}),
      ...(excluded.has(l.lap as number) ? { x: excluded.get(l.lap as number)! } : {}),
      ...(tc != null ? { tc } : {}),
    };
  });

  // --- stints of our car ---------------------------------------------------
  const stints: RaceLogStintRow[] = [];
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
    // The stint average runs on the SAME rule as the driver average — no
    // formation/start lap, no in/out lap, nothing under a full-course yellow
    // and no restart lap. (It used to be "within +5% of the car's best", a
    // heuristic that quietly disagreed with the driver figures next to it.)
    // A stint that is nothing but excluded laps keeps its raw mean rather than
    // showing a blank.
    const clean = inStint.filter((l) => l.lap == null || !excluded.has(l.lap));
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
    temps,
    exclV: PARSER_EXCLUSION_GENERATION,
    incidentSource,
  };
}
