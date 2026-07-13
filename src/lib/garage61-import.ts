// Aggregates raw per-lap rows from a Garage 61 "Session export" (.xlsx) into
// per-driver race pace + fuel/lap, for the stint planner. Track/car-agnostic:
// full green laps are isolated by FUEL USED (a full lap burns roughly the modal
// amount; spins / resets / partials burn far less), then trimmed to a window
// around the driver's fast pace so slow traffic laps don't skew the median.

export type G61LapRow = {
  driver: string;
  laptimeSec: number;
  fuelUsed: number;
  pitIn: boolean;
  pitOut: boolean;
};

export type G61DriverAgg = {
  driver: string;
  laps: number; // clean full laps used
  bestSec: number;
  racePaceSec: number; // median of clean full laps
  fuelPerLap: number; // median fuel used on clean full laps
};

export type G61ImportResult = {
  drivers: G61DriverAgg[];
  overall: { laptimeSec: number; fuelPerLap: number; cleanLaps: number };
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

export function aggregateGarage61Laps(rows: G61LapRow[]): G61ImportResult {
  const byDriver = new Map<string, G61LapRow[]>();
  for (const r of rows) {
    const name = (r.driver ?? "").trim();
    if (!name) continue;
    (byDriver.get(name) ?? byDriver.set(name, []).get(name)!).push(r);
  }

  const drivers: G61DriverAgg[] = [];
  const allCleanLaptimes: number[] = [];
  const allCleanFuels: number[] = [];

  for (const [driver, laps] of byDriver) {
    const cand = laps.filter(
      (l) => !l.pitIn && !l.pitOut && l.laptimeSec > 30 && l.fuelUsed >= 0
    );
    const fuels = cand.filter((l) => l.fuelUsed > 0.3).map((l) => l.fuelUsed);
    if (fuels.length === 0) continue;
    const medFuel = median(fuels);
    // Full green laps: burned ~a full lap's fuel and took a real lap's time.
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
    const lts = clean.map((l) => l.laptimeSec);
    const fus = clean.map((l) => l.fuelUsed);
    drivers.push({
      driver,
      laps: clean.length,
      bestSec: Math.min(...lts),
      racePaceSec: median(lts),
      fuelPerLap: median(fus),
    });
    allCleanLaptimes.push(...lts);
    allCleanFuels.push(...fus);
  }

  drivers.sort((a, b) => a.racePaceSec - b.racePaceSec);
  return {
    drivers,
    overall: {
      // Team-typical baseline pace (per-driver values override this per stint).
      laptimeSec: median(drivers.map((d) => d.racePaceSec)),
      fuelPerLap: median(allCleanFuels),
      cleanLaps: allCleanLaptimes.length,
    },
  };
}
