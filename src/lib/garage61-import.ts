// Aggregates raw per-lap rows from a Garage 61 session (xlsx export OR live API)
// into per-driver race pace + fuel/lap, for the stint planner. Track/car-
// agnostic: full green laps are isolated by FUEL USED (a full lap burns roughly
// the modal amount; spins / resets / partials burn far less), then trimmed to a
// window around the driver's fast pace so slow traffic laps don't skew it.
//
// Track temperature: each lap can carry the track temp it was set at. When the
// clean laps span a range of temps we fit lap-time-vs-temp (least squares) to
// get a data-driven sensitivity (seconds per °C) and normalise every driver's
// pace to a common source temperature, so the planner can project pace to the
// race-day track temp. If the temps don't spread, the slope is null and the
// planner falls back to a manual coefficient.

export type G61LapRow = {
  driver: string;
  laptimeSec: number;
  fuelUsed: number;
  pitIn: boolean;
  pitOut: boolean;
  /** Track temperature (°C) when the lap was set, if known. */
  trackTempC?: number | null;
  /** Track wetness 0–100 (%) when the lap was set, if known. */
  trackWetness?: number | null;
};

export type G61DriverAgg = {
  driver: string;
  laps: number; // clean full laps used
  bestSec: number;
  racePaceSec: number; // median of clean full laps (normalised to sourceTempC)
  fuelPerLap: number; // median fuel used on clean full laps
  // Extra stats for the performance dashboard (all lap times normalised to
  // sourceTempC, so consistency isn't inflated by track-temp drift):
  meanSec: number;
  stdSec: number; // population standard deviation — consistency
  minSec: number;
  q1Sec: number;
  q3Sec: number;
  maxSec: number;
  /** Raw (un-normalised) lap points for the lap-time-vs-temp scatter. */
  points: { t: number | null; y: number }[];
  /** Median track temperature of this driver's clean laps, when known — the
   *  conditions their pace and fuel figure actually come from. */
  medianTempC: number | null;
};

/** Data-driven temperature model derived from the clean laps. */
export type G61TempModel = {
  /** Median track temp of the clean laps used (the temp racePaceSec is at). */
  sourceTempC: number | null;
  /** Lap-time sensitivity in seconds per °C, or null if temps didn't spread. */
  slopePerC: number | null;
  minTempC: number | null;
  maxTempC: number | null;
  /** Number of clean laps that carried a temperature. */
  samples: number;
};

/** Wet-weather model built from the laps run in the rain (track wetness above
 *  the threshold). Pace in the wet is far more variable than dry, so this is a
 *  best-estimate reference, not a precise fit. Null when there aren't enough
 *  wet laps. */
export type G61WetModel = {
  laps: number; // wet clean laps used
  overallSec: number; // median wet pace across drivers
  fuelPerLap: number; // median wet fuel/lap
  deltaSec: number | null; // wet − dry (per lap), null if no dry baseline
  minWetness: number;
  maxWetness: number;
  drivers: { driver: string; laps: number; medianSec: number; fuelPerLap: number }[];
};

export type G61ImportResult = {
  drivers: G61DriverAgg[];
  overall: { laptimeSec: number; fuelPerLap: number; cleanLaps: number };
  temp: G61TempModel;
  wet: G61WetModel | null;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const f = Math.floor(k);
  return f + 1 >= s.length ? s[f] : s[f] + (s[f + 1] - s[f]) * (k - f);
}

/** Ordinary least-squares slope of y on x (dy/dx). Null if x barely varies. */
function olsSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i] - my);
  }
  if (sxx < 1e-6) return null;
  return sxy / sxx;
}

// A temp fit is only trustworthy with enough spread + samples.
const MIN_TEMP_SPREAD_C = 3;
const MIN_TEMP_SAMPLES = 8;

// Track wetness (0–100 %) above this counts a lap as "wet".
const WET_THRESHOLD = 10;
// Need at least this many clean wet laps to report a wet model.
const MIN_WET_LAPS = 3;

// Loose name key for matching a Garage 61 driver to a roster name: lowercase,
// keep only letters/digits (drops spaces, dots, accents-as-punctuation).
const nameKey = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** True if a Garage 61 driver name matches a roster name (either direction of
 *  containment, so "Thomas" ↔ "Thomas Herbrig" still matches). */
function nameMatches(g61Name: string, rosterName: string): boolean {
  const a = nameKey(g61Name);
  const b = nameKey(rosterName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export type AggregateOpts = {
  /** When set (non-empty), only include laps from drivers whose name matches
   *  one of these roster names — so a pull of a whole Garage 61 team is scoped
   *  to the drivers actually on this plan. */
  rosterNames?: string[];
};

export function aggregateGarage61Laps(
  rows: G61LapRow[],
  opts: AggregateOpts = {}
): G61ImportResult {
  const roster = (opts.rosterNames ?? []).filter((n) => n.trim() !== "");
  const scoped =
    roster.length > 0
      ? rows.filter((r) => roster.some((n) => nameMatches(r.driver ?? "", n)))
      : rows;

  // Split rain out of the dry model: a lap counts as wet above the threshold.
  // Wet laps must not pollute the dry pace / fuel / temperature fit.
  const isWet = (r: G61LapRow) => (r.trackWetness ?? 0) > WET_THRESHOLD;
  const dryRows = scoped.filter((r) => !isWet(r));
  const wetRows = scoped.filter(isWet);

  const byDriver = new Map<string, G61LapRow[]>();
  for (const r of dryRows) {
    const name = (r.driver ?? "").trim();
    if (!name) continue;
    (byDriver.get(name) ?? byDriver.set(name, []).get(name)!).push(r);
  }

  // First pass: per driver, isolate the clean full green laps (with temp).
  const cleanByDriver = new Map<string, G61LapRow[]>();
  for (const [driver, laps] of byDriver) {
    const cand = laps.filter(
      (l) => !l.pitIn && !l.pitOut && l.laptimeSec > 30 && l.fuelUsed >= 0
    );
    const fuels = cand.filter((l) => l.fuelUsed > 0.3).map((l) => l.fuelUsed);
    if (fuels.length === 0) continue;
    const medFuel = median(fuels);
    const full = cand.filter(
      (l) => l.fuelUsed >= 0.6 * medFuel && l.laptimeSec > 60
    );
    if (full.length === 0) continue;
    const ref = percentile(
      full.map((l) => l.laptimeSec),
      0.1
    );
    let clean = full.filter(
      (l) => l.laptimeSec >= ref * 0.95 && l.laptimeSec <= ref * 1.05
    );
    if (clean.length === 0) clean = full;
    cleanByDriver.set(driver, clean);
  }

  // Fit lap-time vs temp WITHIN each driver (fixed effects): subtract each
  // driver's own mean temp + mean lap time before pooling, so a fast driver who
  // only ran in the heat can't masquerade as a temperature effect. `temps`
  // (raw) drives the source temp + range; `resT`/`resY` are the demeaned
  // residuals the slope is fit on.
  const temps: number[] = [];
  const resT: number[] = [];
  const resY: number[] = [];
  for (const clean of cleanByDriver.values()) {
    const withT = clean.filter(
      (l) => typeof l.trackTempC === "number" && isFinite(l.trackTempC as number)
    );
    for (const l of withT) temps.push(l.trackTempC as number);
    if (withT.length >= 2) {
      const mt =
        withT.reduce((a, l) => a + (l.trackTempC as number), 0) / withT.length;
      const my = withT.reduce((a, l) => a + l.laptimeSec, 0) / withT.length;
      for (const l of withT) {
        resT.push((l.trackTempC as number) - mt);
        resY.push(l.laptimeSec - my);
      }
    }
  }
  const sourceTempC = temps.length ? median(temps) : null;
  const minTempC = temps.length ? Math.min(...temps) : null;
  const maxTempC = temps.length ? Math.max(...temps) : null;
  let slopePerC: number | null = null;
  if (
    resT.length >= MIN_TEMP_SAMPLES &&
    minTempC != null &&
    maxTempC != null &&
    maxTempC - minTempC >= MIN_TEMP_SPREAD_C
  ) {
    slopePerC = olsSlope(resT, resY);
  }

  // Second pass: per driver, normalise pace to sourceTempC (when we have a
  // slope), then take medians. Without a slope, use raw lap times.
  const normLap = (l: G61LapRow): number => {
    if (
      slopePerC != null &&
      sourceTempC != null &&
      typeof l.trackTempC === "number" &&
      isFinite(l.trackTempC)
    ) {
      return l.laptimeSec - slopePerC * (l.trackTempC - sourceTempC);
    }
    return l.laptimeSec;
  };

  const drivers: G61DriverAgg[] = [];
  const allCleanLaptimes: number[] = [];
  const allCleanFuels: number[] = [];
  for (const [driver, clean] of cleanByDriver) {
    const lts = clean.map(normLap);
    const fus = clean.map((l) => l.fuelUsed);
    const mean = lts.reduce((a, b) => a + b, 0) / lts.length;
    const variance =
      lts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lts.length;
    drivers.push({
      driver,
      laps: clean.length,
      bestSec: Math.min(...lts),
      racePaceSec: median(lts),
      fuelPerLap: median(fus),
      meanSec: mean,
      stdSec: Math.sqrt(variance),
      minSec: Math.min(...lts),
      q1Sec: percentile(lts, 0.25),
      q3Sec: percentile(lts, 0.75),
      maxSec: Math.max(...lts),
      points: clean.map((l) => ({
        t:
          typeof l.trackTempC === "number" && isFinite(l.trackTempC)
            ? l.trackTempC
            : null,
        y: l.laptimeSec,
      })),
      medianTempC: (() => {
        const ts = clean
          .map((l) => l.trackTempC)
          .filter((t): t is number => typeof t === "number" && isFinite(t));
        return ts.length ? median(ts) : null;
      })(),
    });
    allCleanLaptimes.push(...lts);
    allCleanFuels.push(...fus);
  }

  drivers.sort((a, b) => a.racePaceSec - b.racePaceSec);
  const dryOverall = median(drivers.map((d) => d.racePaceSec));

  // ---- Wet-weather model (from the laps run in the rain) ----
  const wet = buildWetModel(wetRows, dryOverall);

  return {
    drivers,
    overall: {
      laptimeSec: dryOverall,
      fuelPerLap: median(allCleanFuels),
      cleanLaps: allCleanLaptimes.length,
    },
    temp: { sourceTempC, slopePerC, minTempC, maxTempC, samples: temps.length },
    wet,
  };
}

// Aggregate the wet laps into a per-driver wet pace + a wet-vs-dry delta. Wet
// pace is noisy, so we use a looser full-green isolation (fuel-based, no ±5%
// pace window) and medians. `dryOverall` is the dry median pace for the delta.
function buildWetModel(
  wetRows: G61LapRow[],
  dryOverall: number
): G61WetModel | null {
  if (wetRows.length === 0) return null;
  const byDriver = new Map<string, G61LapRow[]>();
  for (const r of wetRows) {
    const name = (r.driver ?? "").trim();
    if (!name) continue;
    (byDriver.get(name) ?? byDriver.set(name, []).get(name)!).push(r);
  }
  const out: G61WetModel["drivers"] = [];
  const allTimes: number[] = [];
  const allFuels: number[] = [];
  const wetnessVals: number[] = [];
  for (const [driver, laps] of byDriver) {
    const cand = laps.filter(
      (l) => !l.pitIn && !l.pitOut && l.laptimeSec > 60 && l.fuelUsed >= 0
    );
    const fuels = cand.filter((l) => l.fuelUsed > 0.3).map((l) => l.fuelUsed);
    if (fuels.length === 0) continue;
    const medFuel = median(fuels);
    const full = cand.filter((l) => l.fuelUsed >= 0.6 * medFuel);
    if (full.length === 0) continue;
    const times = full.map((l) => l.laptimeSec);
    const fus = full.map((l) => l.fuelUsed);
    out.push({
      driver,
      laps: full.length,
      medianSec: median(times),
      fuelPerLap: median(fus),
    });
    allTimes.push(...times);
    allFuels.push(...fus);
    for (const l of full) {
      if (typeof l.trackWetness === "number" && isFinite(l.trackWetness))
        wetnessVals.push(l.trackWetness);
    }
  }
  if (allTimes.length < MIN_WET_LAPS) return null;
  out.sort((a, b) => a.medianSec - b.medianSec);
  const overallSec = median(allTimes);
  return {
    laps: allTimes.length,
    overallSec,
    fuelPerLap: median(allFuels),
    deltaSec: dryOverall > 0 ? overallSec - dryOverall : null,
    minWetness: wetnessVals.length ? Math.min(...wetnessVals) : WET_THRESHOLD,
    maxWetness: wetnessVals.length ? Math.max(...wetnessVals) : WET_THRESHOLD,
    drivers: out,
  };
}
