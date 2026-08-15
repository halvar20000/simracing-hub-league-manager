// The plan's Garage 61 LAP POOL.
//
// Until now every import — an .xlsx session export or a live pull — replaced
// the previous one: the plan kept the aggregated result and threw the laps
// away, so a second test session could only ever overwrite the first. Teams
// practise across several evenings, and the honest pace of a driver is the one
// measured over all of them.
//
// So the plan keeps the RAW laps of each import, and the aggregation runs over
// the union. That matters beyond bigger sample sizes: the median is exact
// (aggregates cannot be merged into a median), and the lap-time-vs-temperature
// fit gets its spread from sessions run at different temps — which is precisely
// the fit a single session usually cannot give.
//
// Laps are stored PACKED (a tuple per lap, numbers rounded to below measurement
// noise) because this lives in `StintPlan.payload` and the planner auto-saves
// the whole payload while people type.
//
// Pure module: no DB, no React, no "use server".

import type { G61LapRow } from "@/lib/garage61-import";

/** [driver index, lap time s, fuel used L, flags, track °C, wetness %, date ms]
 *  flags: bit 0 = pit in, bit 1 = pit out. */
export type G61PackedLap = [
  number,
  number,
  number,
  number,
  number | null,
  number | null,
  number | null,
];

/** One import kept in the pool. */
export type G61Source = {
  id: string;
  kind: "pull" | "upload";
  /** File name of the export, or the window label of a pull. */
  label: string;
  importedAt: string; // ISO
  /** Driver names of this import; the packed laps index into this. */
  drivers: string[];
  laps: G61PackedLap[];
  /** Fingerprint of the laps — re-importing the same file replaces it instead
   *  of counting every lap twice. */
  sig: string;
};

/** Most laps a plan will hold across all sources.
 *
 *  2000 laps is around 60 hours of driving at a GT3 lap — far more practice
 *  than any team brings to one race — and costs about 80 KB of payload packed
 *  (the same laps unpacked would be 300 KB). The planner auto-saves the whole
 *  payload while people type, so this is a real budget, not a formality. */
export const MAX_POOL_LAPS = 2000;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? null : Math.round(n * 10) / 10;

/** Pack raw rows into the compact form stored on the plan. */
export function packLaps(rows: G61LapRow[]): {
  drivers: string[];
  laps: G61PackedLap[];
} {
  const drivers: string[] = [];
  const index = new Map<string, number>();
  const laps: G61PackedLap[] = [];
  for (const r of rows) {
    const name = (r.driver ?? "").trim();
    if (!name) continue;
    let di = index.get(name);
    if (di == null) {
      di = drivers.length;
      drivers.push(name);
      index.set(name, di);
    }
    laps.push([
      di,
      r3(r.laptimeSec),
      r3(r.fuelUsed),
      (r.pitIn ? 1 : 0) | (r.pitOut ? 2 : 0),
      r1(r.trackTempC),
      r1(r.trackWetness),
      r.dateMs ?? null,
    ]);
  }
  return { drivers, laps };
}

/** The laps of one source, back in the shape the aggregator reads. */
export function unpackSource(src: G61Source): G61LapRow[] {
  return src.laps.map(([di, sec, fuel, flags, temp, wet, dateMs]) => ({
    driver: src.drivers[di] ?? "",
    laptimeSec: sec,
    fuelUsed: fuel,
    pitIn: (flags & 1) === 1,
    pitOut: (flags & 2) === 2,
    trackTempC: temp,
    trackWetness: wet,
    dateMs,
  }));
}

/** Every lap in the pool, oldest import first. */
export function poolRows(sources: G61Source[]): G61LapRow[] {
  return sources.flatMap(unpackSource);
}

export function poolLapCount(sources: G61Source[]): number {
  return sources.reduce((a, s) => a + s.laps.length, 0);
}

/**
 * Fingerprint of an import. Deliberately coarse — count, driver set and the
 * summed lap time to the millisecond — because the same export dropped in
 * twice must be recognised, while two genuinely different sessions must not
 * collide. Re-importing a file is a normal mistake; silently doubling its laps
 * would quietly weight that session twice in every median.
 */
export function lapsSignature(rows: G61LapRow[]): string {
  let sum = 0;
  const names = new Set<string>();
  for (const r of rows) {
    sum += r.laptimeSec;
    const n = (r.driver ?? "").trim();
    if (n) names.add(n.toLowerCase());
  }
  return `${rows.length}:${Math.round(sum * 1000)}:${[...names].sort().join("|")}`;
}

/** Build a source record from freshly parsed laps. */
export function makeSource(args: {
  id: string;
  kind: "pull" | "upload";
  label: string;
  importedAt: string;
  rows: G61LapRow[];
}): G61Source {
  const { drivers, laps } = packLaps(args.rows);
  return {
    id: args.id,
    kind: args.kind,
    label: args.label,
    importedAt: args.importedAt,
    drivers,
    laps,
    sig: lapsSignature(args.rows),
  };
}

export type AddSourceResult = {
  sources: G61Source[];
  /** True when this import replaced an identical earlier one. */
  replacedDuplicate: boolean;
  /** Labels of the oldest imports dropped to stay under MAX_POOL_LAPS. */
  evicted: string[];
};

/**
 * Add a source to the pool.
 *
 * `cumulative = false` keeps the old behaviour exactly: the new import IS the
 * pool. Cumulative appends, drops an identical earlier import, and evicts the
 * oldest sources when the cap is reached — never the new one, which is the
 * import the user is looking at.
 */
export function addSource(
  existing: G61Source[],
  next: G61Source,
  cumulative: boolean
): AddSourceResult {
  if (!cumulative) return { sources: [next], replacedDuplicate: false, evicted: [] };

  const dupIdx = existing.findIndex((s) => s.sig === next.sig);
  const base = dupIdx >= 0 ? existing.filter((_, i) => i !== dupIdx) : existing;
  const sources = [...base, next];

  const evicted: string[] = [];
  while (sources.length > 1 && poolLapCount(sources) > MAX_POOL_LAPS) {
    const gone = sources.shift();
    if (gone) evicted.push(gone.label);
  }
  return { sources, replacedDuplicate: dupIdx >= 0, evicted };
}

/** Human summary of a source for the list in the UI. */
export function sourceSummary(src: G61Source): {
  laps: number;
  drivers: number;
  oldestMs: number | null;
  newestMs: number | null;
} {
  const dates = src.laps
    .map((l) => l[6])
    .filter((d): d is number => typeof d === "number");
  return {
    laps: src.laps.length,
    drivers: src.drivers.length,
    oldestMs: dates.length ? Math.min(...dates) : null,
    newestMs: dates.length ? Math.max(...dates) : null,
  };
}
