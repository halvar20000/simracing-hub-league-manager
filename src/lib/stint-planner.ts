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
};

export type StintTemplate = {
  laps: number;
  greenTimeSec: number;
  totalTimeSec: number;
  fuelPerStint: number;
};

/** Fuel-limited stint template for one profile. */
export function stintTemplate(
  p: FuelProfile,
  tankSize: number,
  pitLossSec: number
): StintTemplate {
  const laps = p.fuelPerLap > 0 ? Math.floor(tankSize / p.fuelPerLap) : 0;
  const greenTimeSec = p.laptimeSec * laps;
  return {
    laps,
    greenTimeSec,
    totalTimeSec: greenTimeSec + pitLossSec,
    fuelPerStint: p.fuelPerLap * laps,
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
  } = input;

  const stdTpl = stintTemplate(standard, tankSize, pitLossSec);
  const savTpl = saving ? stintTemplate(saving, tankSize, pitLossSec) : null;
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
    const driver = assign.driverId ? driverById.get(assign.driverId) : null;
    const factor =
      driver?.laptimeSec && prof.laptimeSec > 0
        ? driver.laptimeSec / prof.laptimeSec
        : 1;

    const fullGreen = tpl.greenTimeSec * factor;
    let greenSec = fullGreen;
    let laps = tpl.laps;
    let fuel = tpl.fuelPerStint;
    let endSec = t + fullGreen + pitLossSec;
    let isFinal = false;
    let partial = false;

    if (t + fullGreen >= raceDurationSec) {
      // Chequered flag falls during this stint's on-track running.
      isFinal = true;
      partial = true;
      greenSec = raceDurationSec - t;
      endSec = raceDurationSec;
      const effLaptime = prof.laptimeSec * factor;
      laps = effLaptime > 0 ? greenSec / effLaptime : 0;
      fuel = laps * prof.fuelPerLap;
    } else if (endSec >= raceDurationSec) {
      // Full green completed, but the race ends before/within the pit — no
      // more stints follow. Drop the trailing pit; keep full laps + fuel.
      isFinal = true;
      endSec = raceDurationSec;
    }

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
