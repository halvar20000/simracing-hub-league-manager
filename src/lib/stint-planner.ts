// Enduro stint-planner engine (pure, shared by client + server).
//
// Faithful port of the community "Enduro Manager" spreadsheet's core model:
//   laps per stint  = floor(tankSize / fuelPerLap)              (fuel-limited)
//   green run time  = laptime * laps
//   stint length    = green run time + pit time-loss            (pit at stint end)
//   fuel per stint  = fuelPerLap * laps
// A per-driver pace factor (driverLaptime / baseLaptime) stretches a stint's
// on-track time for a slower driver WITHOUT changing laps or fuel (the stint
// is fuel-limited). The final stint is truncated at the race end; its partial
// fuel = laps(partial) * fuelPerLap. Verified against the reference workbook.

export type FuelProfile = {
  /** Representative lap time, in seconds. */
  laptimeSec: number;
  /** Fuel burned per lap, in litres. */
  fuelPerLap: number;
};

export type PlannerDriver = {
  id: string;
  name: string;
  /** Optional per-driver lap time (s). When set, scales that driver's stint
   *  duration relative to the standard profile lap time. */
  laptimeSec?: number | null;
};

export type StintProfileKey = "standard" | "saving";

export type StintAssignment = {
  profile: StintProfileKey;
  driverId: string | null;
  /** Live correction for this stint, in MINUTES (may be negative). Adjusts the
   *  stint's clock length and cascades to every following stint. */
  correctionMin?: number;
};

export type PlannerInput = {
  /** Total race length from green flag, in seconds. */
  raceDurationSec: number;
  /** Delay from session start to green flag (formation/rolling), in seconds. */
  greenFlagOffsetSec: number;
  /** Total time lost per pit stop (stationary + pit lane delta), in seconds. */
  pitLossSec: number;
  /** Fuel tank capacity, in litres. */
  tankSize: number;
  standard: FuelProfile;
  /** Optional fuel-saving profile (slightly slower lap, less fuel/lap). */
  saving?: FuelProfile | null;
  /** Optional wall-clock of the session start (ms since epoch, UTC). */
  sessionStartUtcMs?: number | null;
  drivers: PlannerDriver[];
  /** Per-stint assignment. Missing/extra entries are handled gracefully. */
  assignments: StintAssignment[];
  /** Stint-length mode + reserve (applied to both profiles). */
  stintMode?: StintMode;
  stintSec?: number;
  stintLaps?: number;
  fuelReserve?: number;
};

export type StintMode = "fuel" | "time" | "laps";

export type StintTemplateOpts = {
  /** Stint length driver. "fuel" (default) = as many laps as the usable tank
   *  allows; "time" = a fixed stint duration; "laps" = a fixed lap count. */
  mode?: StintMode;
  /** Fixed stint on-track duration in seconds (mode = "time"). */
  stintSec?: number;
  /** Fixed lap count per stint (mode = "laps"). */
  stintLaps?: number;
  /** Fuel kept in reserve (litres) — subtracted from the tank for all modes. */
  fuelReserve?: number;
};

export type StintTemplate = {
  laps: number;
  greenTimeSec: number;
  totalTimeSec: number;
  fuelPerStint: number;
  /** True when the stint needs more fuel than the usable tank holds (only
   *  possible in time/laps mode) — the UI should warn. */
  overFuel: boolean;
};

/** Stint template for one profile, honouring stint mode + fuel reserve. */
export function stintTemplate(
  p: FuelProfile,
  tankSize: number,
  pitLossSec: number,
  opts: StintTemplateOpts = {}
): StintTemplate {
  const usable = Math.max(0, tankSize - Math.max(0, opts.fuelReserve ?? 0));
  const fuelLaps = p.fuelPerLap > 0 ? Math.floor(usable / p.fuelPerLap) : 0;
  let laps: number;
  if (opts.mode === "time" && opts.stintSec && p.laptimeSec > 0) {
    laps = Math.max(0, Math.floor(opts.stintSec / p.laptimeSec));
  } else if (opts.mode === "laps" && opts.stintLaps) {
    laps = Math.max(0, Math.floor(opts.stintLaps));
  } else {
    laps = fuelLaps;
  }
  const greenTimeSec = p.laptimeSec * laps;
  const fuelPerStint = p.fuelPerLap * laps;
  return {
    laps,
    greenTimeSec,
    totalTimeSec: greenTimeSec + pitLossSec,
    fuelPerStint,
    overFuel: fuelPerStint > usable + 1e-9,
  };
}

export type ScheduleStint = {
  /** 1-based stint number. */
  index: number;
  profile: StintProfileKey;
  driverId: string | null;
  driverName: string | null;
  /** Race-clock start/end (seconds from green flag). */
  startSec: number;
  endSec: number;
  /** Wall-clock start/end (ms UTC) when a session start is provided. */
  wallStartMs: number | null;
  wallEndMs: number | null;
  /** On-track running time for this stint (excludes the trailing pit). */
  greenSec: number;
  laps: number;
  fuel: number;
  /** True for the last stint of the race (may be shortened). */
  isFinal: boolean;
  /** True when the stint was cut short by the chequered flag. */
  partial: boolean;
  /** The live correction applied to this stint, in minutes. */
  correctionMin: number;
};

export type DriverTotals = {
  driverId: string;
  name: string;
  stints: number;
  driveSec: number;
  laps: number;
  fuel: number;
};

export type PlannerResult = {
  template: { standard: StintTemplate; saving: StintTemplate | null };
  stints: ScheduleStint[];
  raceStartUtcMs: number | null;
  raceEndUtcMs: number | null;
  totals: {
    stintCount: number;
    pitStops: number;
    laps: number;
    fuel: number;
    driverCount: number;
  };
  perDriver: DriverTotals[];
  /** Suggested even split (stints per driver) for balancing. */
  fairShareStints: number | null;
};

const MAX_STINTS = 400; // safety guard against pathological inputs

/** Build the full stint schedule + summaries from planner input. */
export function buildSchedule(input: PlannerInput): PlannerResult {
  const {
    raceDurationSec,
    greenFlagOffsetSec,
    pitLossSec,
    tankSize,
    standard,
    saving,
    sessionStartUtcMs,
    drivers,
    assignments,
    stintMode,
    stintSec,
    stintLaps,
    fuelReserve,
  } = input;

  const tplOpts: StintTemplateOpts = {
    mode: stintMode,
    stintSec,
    stintLaps,
    fuelReserve,
  };
  const stdTpl = stintTemplate(standard, tankSize, pitLossSec, tplOpts);
  const savTpl = saving
    ? stintTemplate(saving, tankSize, pitLossSec, tplOpts)
    : null;
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const raceStartUtcMs =
    sessionStartUtcMs != null
      ? sessionStartUtcMs + greenFlagOffsetSec * 1000
      : null;
  const raceEndUtcMs =
    raceStartUtcMs != null ? raceStartUtcMs + raceDurationSec * 1000 : null;

  const stints: ScheduleStint[] = [];
  let t = 0;
  let i = 0;
  while (t < raceDurationSec - 0.001 && i < MAX_STINTS) {
    const assign = assignments[i] ?? { profile: "standard", driverId: null };
    const useSaving = assign.profile === "saving" && saving != null;
    const prof: FuelProfile = useSaving ? saving! : standard;
    const tpl = useSaving && savTpl ? savTpl : stdTpl;
    if (tpl.laps <= 0) break; // no valid stint (bad inputs) — stop cleanly
    const driver = assign.driverId ? driverById.get(assign.driverId) : null;
    const factor =
      driver?.laptimeSec && prof.laptimeSec > 0
        ? driver.laptimeSec / prof.laptimeSec
        : 1;

    // Live correction (minutes → seconds). Added to this stint's clock length
    // and, because the next stint starts where this one ends, it cascades to
    // every following stint. It does not change laps/fuel (still fuel-limited).
    const correctionMin = assign.correctionMin ?? 0;
    const corrSec = correctionMin * 60;

    const fullGreen = tpl.greenTimeSec * factor;
    let greenSec = fullGreen;
    let laps = tpl.laps;
    let fuel = tpl.fuelPerStint;
    let endSec: number;
    let isFinal = false;
    let partial = false;

    if (t + fullGreen >= raceDurationSec) {
      // Chequered flag falls during this stint's on-track running.
      isFinal = true;
      partial = true;
      greenSec = raceDurationSec - t;
      const effLaptime = prof.laptimeSec * factor;
      laps = effLaptime > 0 ? greenSec / effLaptime : 0;
      fuel = laps * prof.fuelPerLap;
      endSec = raceDurationSec + corrSec; // projected chequered incl. correction
    } else {
      endSec = t + fullGreen + pitLossSec + corrSec;
      // Full green completed but the race ends within the pit/correction tail →
      // this is the last stint; keep its full laps + fuel.
      if (endSec >= raceDurationSec) isFinal = true;
    }
    if (endSec < t) endSec = t; // guard against large negative corrections

    stints.push({
      index: i + 1,
      profile: useSaving ? "saving" : "standard",
      driverId: assign.driverId ?? null,
      driverName: driver?.name ?? null,
      startSec: t,
      endSec,
      wallStartMs: raceStartUtcMs != null ? raceStartUtcMs + t * 1000 : null,
      wallEndMs: raceStartUtcMs != null ? raceStartUtcMs + endSec * 1000 : null,
      greenSec,
      laps,
      fuel,
      isFinal,
      partial,
      correctionMin,
    });
    t = endSec;
    i += 1;
  }

  // Per-driver aggregates.
  const perDriver: DriverTotals[] = drivers.map((d) => {
    const own = stints.filter((s) => s.driverId === d.id);
    return {
      driverId: d.id,
      name: d.name,
      stints: own.length,
      driveSec: own.reduce((a, s) => a + (s.endSec - s.startSec), 0),
      laps: own.reduce((a, s) => a + s.laps, 0),
      fuel: own.reduce((a, s) => a + s.fuel, 0),
    };
  });

  const laps = stints.reduce((a, s) => a + s.laps, 0);
  const fuel = stints.reduce((a, s) => a + s.fuel, 0);
  const driverCount = drivers.length;
  const fairShareStints =
    driverCount > 0 ? Math.ceil(stints.length / driverCount) : null;

  return {
    template: { standard: stdTpl, saving: savTpl },
    stints,
    raceStartUtcMs,
    raceEndUtcMs,
    totals: {
      stintCount: stints.length,
      pitStops: Math.max(0, stints.length - 1),
      laps,
      fuel,
      driverCount,
    },
    perDriver,
    fairShareStints,
  };
}

// ---- Fuel-save strategy optimizer -----------------------------------------
//
// Race time is fixed, so the measure is total distance (laps). Saving fuel
// slows the laps but stretches the tank, which can drop a pit stop and hand
// back its time-loss. This finds, for each achievable pit-stop count, the
// FASTEST pace that still fits it (i.e. the least saving needed), then reports
// which stop-count yields the most laps. The pace/fuel trade-off is modelled
// as a straight line between the Standard and Fuel-save profiles.

export type FuelSaveStrategy = {
  stops: number;
  stints: number;
  laptimeSec: number; // target lap time
  fuelPerLap: number; // target fuel per lap
  lapsPerStint: number;
  totalLaps: number; // distance measure (higher = better)
};

export type FuelSaveOptimization =
  | { ok: false; reason: string }
  | {
      ok: true;
      strategies: FuelSaveStrategy[]; // one per stop-count, ascending
      bestIndex: number; // index of the max-distance strategy
      fullPushIndex: number; // index of the full-push (fastest lap) strategy
    };

export function optimizeFuelSave(args: {
  raceDurationSec: number;
  tankSize: number;
  fuelReserve?: number;
  pitLossSec: number;
  standard: FuelProfile; // full push (fast lap, high fuel)
  saving: FuelProfile; // max save (slow lap, low fuel)
  steps?: number;
}): FuelSaveOptimization {
  const usable = Math.max(0, args.tankSize - Math.max(0, args.fuelReserve ?? 0));
  const T = args.raceDurationSec;
  const P = args.pitLossSec;
  const { standard: std, saving: sav } = args;
  if (T <= 0 || usable <= 0) return { ok: false, reason: "Set a race duration and tank size." };
  if (std.fuelPerLap <= 0 || sav.fuelPerLap <= 0 || std.laptimeSec <= 0 || sav.laptimeSec <= 0)
    return { ok: false, reason: "Fill in both fuel profiles first." };
  if (!(sav.fuelPerLap < std.fuelPerLap) || !(sav.laptimeSec >= std.laptimeSec))
    return {
      ok: false,
      reason:
        "The Fuel-save profile must be slower per lap AND use less fuel than Standard.",
    };

  // Linear pace model: lap time as a function of fuel/lap.
  const slope = (sav.laptimeSec - std.laptimeSec) / (sav.fuelPerLap - std.fuelPerLap);
  const lapAt = (F: number) => std.laptimeSec + slope * (F - std.fuelPerLap);

  const sim = (F: number): FuelSaveStrategy => {
    const L = lapAt(F);
    const lapsPerStint = Math.floor(usable / F);
    const green = L * lapsPerStint;
    let t = 0;
    let laps = 0;
    let stops = 0;
    let stints = 0;
    let guard = 0;
    while (t < T - 1e-6 && guard++ < 1000) {
      if (green <= 0) break;
      if (t + green >= T) {
        laps += (T - t) / L;
        t = T;
        stints++;
      } else {
        laps += lapsPerStint;
        t += green;
        stints++;
        if (t < T - 1e-6) {
          t += P;
          stops++;
        }
      }
    }
    return {
      stops,
      stints,
      laptimeSec: L,
      fuelPerLap: F,
      lapsPerStint,
      totalLaps: laps,
    };
  };

  // Sweep the fuel band from max-save to full-push; keep the best (fastest,
  // most laps) result for each distinct stop count.
  const steps = args.steps ?? 400;
  const byStop = new Map<number, FuelSaveStrategy>();
  for (let i = 0; i <= steps; i++) {
    const F = sav.fuelPerLap + ((std.fuelPerLap - sav.fuelPerLap) * i) / steps;
    const r = sim(F);
    const prev = byStop.get(r.stops);
    if (!prev || r.totalLaps > prev.totalLaps) byStop.set(r.stops, r);
  }
  const strategies = [...byStop.values()].sort((a, b) => a.stops - b.stops);
  if (strategies.length === 0) return { ok: false, reason: "No feasible strategy." };

  let bestIndex = 0;
  let fullPushIndex = 0;
  strategies.forEach((s, i) => {
    if (s.totalLaps > strategies[bestIndex].totalLaps) bestIndex = i;
    if (s.stops > strategies[fullPushIndex].stops) fullPushIndex = i;
  });
  return { ok: true, strategies, bestIndex, fullPushIndex };
}

/** Seconds → "M:SS.s" — lap-time style (tenths). */
export function fmtLap(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, "0")}`;
}

/** Seconds → "H:MM:SS" (or "M:SS" under an hour). */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** "H:MM:SS" / "MM:SS" / "SS" → seconds. Returns null on empty/invalid. */
export function parseDurationToSec(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const parts = t.split(":").map((x) => x.trim());
  if (parts.some((x) => x === "" || isNaN(Number(x)))) return null;
  const nums = parts.map(Number);
  let sec = 0;
  for (const n of nums) sec = sec * 60 + n;
  return sec;
}
