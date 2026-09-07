/**
 * The class around us, as the de-briefing shows it.
 *
 * Turns the field-wide parse (src/lib/race-log-field.ts) into the one thing a
 * team actually argues about after a race: were we slow, or was everybody
 * slow? Everything here is a comparison against OUR OWN CLASS — a GT3 median
 * next to an LMP2 median is not a benchmark, it is a category error.
 *
 * Deliberately per CAR, never per driver: the logger freezes the driver name
 * at session start, so a foreign car's laps cannot be split between its
 * drivers. Saying "team X's median" is true; saying "driver Y's median" out of
 * this data would not be.
 *
 * Pure module: no DB, no React.
 */

import type { FieldCar, FieldModel } from "@/lib/race-log-field";

export type FieldBenchRow = {
  carNumber: string | null;
  team: string | null;
  own: boolean;
  /** Median racing lap. Null when the log saw too little of this car. */
  cleanSec: number | null;
  /** Its distance from the class median, in seconds. Negative = quicker. */
  deltaSec: number | null;
  bestSec: number | null;
  spreadSec: number | null;
  stops: number;
  pitMedianSec: number | null;
  laps: number | null;
  classPos: number | null;
  /** Numbered laps the log captured, against the laps actually completed. */
  coveragePct: number | null;
};

export type FieldWindowPoint = {
  /** Minutes into the session at the middle of the window. */
  min: number;
  own: number | null;
  cls: number | null;
};

export type FieldBench = {
  track: string | null;
  className: string | null;
  cars: number;
  classCleanSec: number | null;
  classBestSec: number | null;
  classPitMedianSec: number | null;
  own: FieldBenchRow | null;
  /** Our place in the class by median pace (1 = quickest), not by result. */
  paceRank: number | null;
  /** How many cars in the class had a comparable median at all. */
  paceRanked: number;
  rows: FieldBenchRow[];
  windows: FieldWindowPoint[];
  /** Full-course yellows, as [from, to] minutes — drawn as bands. */
  cautionBands: { from: number; to: number }[];
  /** True when this parse came from another team's upload of the same race. */
  shared: boolean;
};

const round2 = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;

function rowOf(c: FieldCar, classMedian: number | null, own: boolean): FieldBenchRow {
  return {
    carNumber: c.carNumber,
    team: c.team,
    own,
    cleanSec: c.cleanSec,
    deltaSec:
      c.cleanSec != null && classMedian != null
        ? round2(c.cleanSec - classMedian)
        : null,
    bestSec: c.bestSec,
    spreadSec: c.spreadSec,
    stops: c.stops,
    pitMedianSec: c.pitMedianSec,
    laps: c.finalLaps,
    classPos: c.finishClassPos,
    coveragePct:
      c.finalLaps != null && c.finalLaps > 0
        ? Math.round((c.loggedLaps / c.finalLaps) * 100)
        : null,
  };
}

/**
 * Build the class benchmark around our own car.
 *
 * Returns null when our car is not in the log (a plan whose roster never
 * matched, or a log from a different session) — better nothing than a
 * comparison against a class we did not race in.
 */
export function buildFieldBench(
  model: FieldModel,
  ownCarNumber: string | null,
  opts?: { shared?: boolean }
): FieldBench | null {
  const key = (ownCarNumber ?? "").trim();
  const ownCar = key
    ? (model.cars.find((c) => (c.carNumber ?? "").trim() === key) ?? null)
    : null;
  if (!ownCar) return null;

  const className = ownCar.carClass;
  const cls = className
    ? (model.classes.find((c) => c.name === className) ?? null)
    : null;
  const members = model.cars.filter((c) => c.carClass === className);

  const classMedian = cls?.cleanSec ?? null;
  const rows = members
    .map((c) => rowOf(c, classMedian, c.carIdx === ownCar.carIdx))
    // Quickest median first; cars the log could not measure go last, in
    // finishing order, instead of being dropped — a team that vanished from
    // the trace is information too.
    .sort((a, b) => {
      if (a.cleanSec == null && b.cleanSec == null)
        return (a.classPos ?? 999) - (b.classPos ?? 999);
      if (a.cleanSec == null) return 1;
      if (b.cleanSec == null) return -1;
      return a.cleanSec - b.cleanSec;
    });

  const ranked = rows.filter((r) => r.cleanSec != null);
  const paceRank = ranked.findIndex((r) => r.own);

  const windows: FieldWindowPoint[] = [];
  for (let w = 0; w < model.windowCount; w += 1) {
    const own = ownCar.windows[w] ?? null;
    const c = cls?.windows[w] ?? null;
    if (own == null && c == null) continue;
    windows.push({
      min: Math.round(((w + 0.5) * model.windowSec) / 60),
      own,
      cls: c,
    });
  }

  return {
    track: model.track,
    className,
    cars: members.length,
    classCleanSec: classMedian,
    classBestSec: cls?.bestSec ?? null,
    classPitMedianSec: cls?.pitMedianSec ?? null,
    own: rows.find((r) => r.own) ?? null,
    paceRank: paceRank >= 0 ? paceRank + 1 : null,
    paceRanked: ranked.length,
    rows,
    windows,
    cautionBands: model.cautions.map((w) => ({
      from: Math.round(w.from / 60),
      to: Math.round(w.to / 60),
    })),
    shared: opts?.shared === true,
  };
}
