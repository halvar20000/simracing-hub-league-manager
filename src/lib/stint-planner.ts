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
  /** Optional per-driver fuel consumption (l/lap). When set it replaces the
   *  profile's fuel for that driver's stints — a smooth driver genuinely gets
   *  a lap more out of the same tank. */
  fuelPerLap?: number | null;
  /** Optional per-driver tyre wear in % per lap. Drives the tyre condition
   *  carried across stints when tyres are not changed. */
  tyreWearPctPerLap?: number | null;
};

export type StintProfileKey = "standard" | "saving";

/** How wet the track is for a stint. */
export type StintCondition = "dry" | "half" | "wet";

/** The condition of an assignment, honouring the legacy boolean. */
export function conditionOf(a: { condition?: StintCondition; wet?: boolean }): StintCondition {
  return a.condition ?? (a.wet ? "wet" : "dry");
}

export type StintAssignment = {
  profile: StintProfileKey;
  driverId: string | null;
  /** Live correction for this stint, in MINUTES (may be negative). Adjusts the
   *  stint's clock length and cascades to every following stint. */
  correctionMin?: number;
  /** Track condition for this stint. "half" = damp/drying, "wet" = full wet;
   *  each adds its own penalty per lap, so a race can go dry → damp → wet →
   *  damp → dry. Undefined falls back to the legacy `wet` flag. */
  condition?: StintCondition;
  /** Legacy full-wet flag (plans saved before half-wet existed). */
  wet?: boolean;
  /** Track temperature for THIS stint, in °C. Null/undefined = run at the
   *  plan's base temperature, i.e. exactly the entered pace. Anything else
   *  shifts the lap time by `tempSlopePerC × (this − baseTempC)`, so a six-hour
   *  race can cool off through the evening without touching the pace fields. */
  trackTempC?: number | null;
  /** Whether tyres are changed at the stop that ENDS this stint. Undefined =
   *  yes (the normal case). Only meaningful with a pit model. */
  tyreChange?: boolean;
  /** Litres to put in at the stop that ENDS this stint. Undefined/null = fill
   *  the tank. A smaller number is a splash: shorter stop, shorter next stint. */
  fillLitres?: number | null;
};

/**
 * Measured pit-stop constants for one car + track.
 *
 * Modelled after the method Johann Solowej uses: drive the pit lane in a test
 * session and time the section that contains entry and exit against a clean
 * reference lap, then decompose the variants (drive-through, stop without
 * service, tyres only, tyres + fuel) into constants. The result is that a stop
 * is *computed* per stop instead of being one flat number — a 40 L splash and a
 * full fill with tyres are not the same stop, and on a 24 h race that gap is
 * worth minutes.
 *
 *   stop = laneLossSec + max(service, driverChange ? driverChangeSec : 0)
 *   service = tyreSequential ? refuel + tyres : max(refuel, tyres)
 *
 * The driver change runs in parallel with service and only costs time when the
 * service itself is shorter than the swap; the tyre change on a GT3 in iRacing
 * does NOT overlap the refuelling, hence `tyreSequential`.
 */
export type PitModel = {
  /** Time lost entering, stopping and leaving the pits WITHOUT any service,
   *  measured against a green lap (Johann's Spa number: 41 s). */
  laneLossSec: number;
  /** Refuel rate in litres per second (GT3 ≈ 2.5, LMP ≈ 1.81). */
  refuelLps: number;
  /** Tyre change duration in seconds (≈ 20). */
  tyreChangeSec: number;
  /** Mandatory driver-change floor in seconds (iRacing: 30), runs in parallel. */
  driverChangeSec: number;
  /** True when the tyre change adds to the refuel time instead of overlapping. */
  tyreSequential: boolean;
};

export type PitStopBreakdown = {
  totalSec: number;
  laneSec: number;
  refuelSec: number;
  tyreSec: number;
  /** Extra seconds the driver change costs beyond the service time (often 0). */
  swapExtraSec: number;
  litres: number;
};

/** One stop, decomposed. Pure — the unit tests drive this directly. */
export function pitStopSeconds(
  m: PitModel,
  opts: { litres: number; tyres: boolean; driverChange: boolean }
): PitStopBreakdown {
  const litres = Math.max(0, opts.litres);
  const refuelSec = m.refuelLps > 0 ? litres / m.refuelLps : 0;
  const tyreSec = opts.tyres ? Math.max(0, m.tyreChangeSec) : 0;
  const service = m.tyreSequential ? refuelSec + tyreSec : Math.max(refuelSec, tyreSec);
  const swapFloor = opts.driverChange ? Math.max(0, m.driverChangeSec) : 0;
  const swapExtraSec = Math.max(0, swapFloor - service);
  return {
    totalSec: Math.max(0, m.laneLossSec) + service + swapExtraSec,
    laneSec: Math.max(0, m.laneLossSec),
    refuelSec,
    tyreSec,
    swapExtraSec,
    litres,
  };
}

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
  /** Seconds/lap added to a FULL WET stint. */
  wetDeltaSec?: number;
  /** Seconds/lap added to a HALF WET (damp / drying) stint. */
  halfWetDeltaSec?: number;
  /** Seconds/lap added to EVERY stint: the difference between the pace the team
   *  sets alone in practice and what they really run in a race, in traffic,
   *  with cars to pass and be passed by. Practice data is always optimistic;
   *  this is the honesty tax on it. */
  trafficPenaltySec?: number;
  /** The temperature the entered lap times represent (the plan's Track temp).
   *  Per-stint temperatures are measured against this. */
  baseTempC?: number | null;
  /** Seconds/lap per °C above the base temperature (Garage 61 fit or manual). */
  tempSlopePerC?: number;
  /** Seconds saved at a stop when the SAME driver stays in (a double-stint /
   *  refuel-only stop): the mandatory driver-swap floor no longer applies.
   *  Effectively `max(0, driverSwapSec − refuelSec)`. 0 = no saving. Ignored
   *  when `pitModel` is set — the model computes the swap cost properly. */
  driverChangeSaveSec?: number;
  /** Measured pit constants. When present, every stop is computed from the
   *  litres actually taken, whether tyres are changed and whether the driver
   *  changes, instead of using the flat `pitLossSec`. */
  pitModel?: PitModel | null;
  /** Tyre wear in % per lap used for drivers without their own figure.
   *  0/undefined = no tyre modelling. */
  tyreWearPctPerLap?: number;
  /** Lowest tyre condition (%) considered raceable — stints ending below this
   *  are flagged. Default 0 (never flag). */
  tyreMinPct?: number;
  /** Litres burned between leaving the box and the green flag — the lap to the
   *  grid and the laps behind the pace car. The car starts the race with that
   *  much less on board, so it comes off the FIRST stint only. */
  gridFuelL?: number;
  /** Lap target for a distance race ("500 laps", "1000 km" converted to laps).
   *  When set (> 0) the race ends on this lap count and `raceDurationSec` is
   *  ignored — the finish time becomes a projection instead of an input. */
  raceLaps?: number | null;
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
  /** True when this stint was run in the full wet (kept for existing callers). */
  wet: boolean;
  /** Track condition of this stint. */
  condition: StintCondition;
  /** Seconds/lap the weather added (0 when dry). */
  weatherDeltaSec: number;
  /** Seconds/lap the race-traffic penalty added. */
  trafficDeltaSec: number;
  /** Track temperature used for this stint, or null when it ran at the base. */
  trackTempC: number | null;
  /** Seconds/lap the temperature added (negative = cooler and quicker). */
  tempDeltaSec: number;

  // --- the stop that ENDS this stint (null on the last stint) ---
  /** Total time lost at that stop, in seconds — flat or modelled. */
  stopSec: number;
  /** Decomposition of the stop; null unless a pit model is in use. */
  stop: PitStopBreakdown | null;
  /** Whether tyres are changed at that stop. */
  tyreChange: boolean;

  // --- fuel state (litres, usable = above the reserve) ---
  fuelAtStart: number;
  fuelAtEnd: number;
  /** Litres taken at the stop that ends this stint. */
  fillLitres: number;
  /** True when the stint could not run the full tank because the previous stop
   *  was only a splash — the UI should show it as a deliberate short stint. */
  shortFill: boolean;

  // --- tyre state (%) ---
  tyreStartPct: number;
  tyreEndPct: number;
  /** True when this stint ends below the plan's minimum tyre condition. */
  tyreWarn: boolean;
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
  /** How long the race takes: the entered duration in a timed race, the
   *  PROJECTED total in a lap/distance race. */
  raceSec: number;
  /** True when the race ends on a lap count rather than on the clock. */
  lapLimited: boolean;
  /** Laps still to run when the schedule ran out of stints (should be 0). */
  lapsShort: number;
  totals: {
    stintCount: number;
    pitStops: number;
    laps: number;
    fuel: number;
    driverCount: number;
    stopTimeSec: number;
    tyreChanges: number;
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
    wetDeltaSec,
    baseTempC,
    tempSlopePerC,
    driverChangeSaveSec,
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
  // Filled after the loop for a lap-limited race (the finish is a projection).
  let raceEndUtcMs =
    raceStartUtcMs != null ? raceStartUtcMs + raceDurationSec * 1000 : null;

  // Usable fuel = the tank minus whatever the team refuses to burn. The whole
  // fuel state below is expressed in usable litres, so "full" always means
  // `usableTank` and a splash is simply a smaller number.
  const usableTank = Math.max(0, tankSize - Math.max(0, fuelReserve ?? 0));
  const model = input.pitModel ?? null;
  const baseWear = Math.max(0, input.tyreWearPctPerLap ?? 0);
  const tyreMin = Math.max(0, input.tyreMinPct ?? 0);

  // A lap-limited race (500 laps, 1000 km → laps) ends on distance, not on the
  // clock: the loop counts laps down and the finish time falls out of it.
  const lapTarget = input.raceLaps && input.raceLaps > 0 ? Math.floor(input.raceLaps) : null;
  const lapLimited = lapTarget != null;

  const stints: ScheduleStint[] = [];
  let t = 0;
  let i = 0;
  let lapsDone = 0;
  // The car leaves the box full, but the lap to the grid and the rolling start
  // are already gone by the time the flag drops — so stint 1 starts short.
  let fuelAtStart = Math.max(0, usableTank - Math.max(0, input.gridFuelL ?? 0));
  let tyreStartPct = 100;
  while (
    (lapLimited ? lapsDone < lapTarget! - 1e-9 : t < raceDurationSec - 0.001) &&
    i < MAX_STINTS
  ) {
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
    // Per-driver fuel + tyre figures fall back to the profile / plan defaults.
    const fuelPerLapEff =
      driver?.fuelPerLap && driver.fuelPerLap > 0 ? driver.fuelPerLap : prof.fuelPerLap;
    const wearPerLap =
      driver?.tyreWearPctPerLap != null && driver.tyreWearPctPerLap >= 0
        ? driver.tyreWearPctPerLap
        : baseWear;

    // Live correction (minutes → seconds). Added to this stint's clock length
    // and, because the next stint starts where this one ends, it cascades to
    // every following stint. It does not change laps/fuel (still fuel-limited).
    const correctionMin = assign.correctionMin ?? 0;
    const corrSec = correctionMin * 60;

    // Weather: a damp track costs less than a soaked one, and both leave
    // fuel/laps alone (a stint stays fuel-limited) — only the clock grows.
    const cond = conditionOf(assign);
    const wetAdd =
      cond === "wet"
        ? Math.max(0, wetDeltaSec ?? 0)
        : cond === "half"
          ? Math.max(0, input.halfWetDeltaSec ?? 0)
          : 0;
    // Race traffic applies to every stint, wet or dry.
    const trafficAdd = Math.max(0, input.trafficPenaltySec ?? 0);

    // Per-stint track temperature. A stint without one runs at the plan's base
    // temperature, i.e. exactly the entered pace — an empty field is always
    // neutral. Otherwise the lap time shifts by the temperature slope, so an
    // evening race can cool down stint by stint without touching the profiles.
    const stintTemp = assign.trackTempC;
    const tempAdd =
      stintTemp != null &&
      baseTempC != null &&
      Number.isFinite(stintTemp) &&
      Number.isFinite(baseTempC)
        ? (tempSlopePerC ?? 0) * (stintTemp - baseTempC)
        : 0;
    const paceAdd = wetAdd + tempAdd + trafficAdd;
    const effLaptime = prof.laptimeSec * factor + paceAdd;

    // How many laps this stint runs. In fuel mode that is what is actually in
    // the tank — which after a splash is less than a full stint. time/laps mode
    // keep the template.
    const plannedLaps =
      (stintMode ?? "fuel") === "fuel"
        ? fuelPerLapEff > 0
          ? Math.floor(fuelAtStart / fuelPerLapEff)
          : 0
        : tpl.laps;
    if (plannedLaps <= 0) break; // no fuel / bad inputs — stop cleanly
    const fullGreen = effLaptime * plannedLaps;
    let greenSec = fullGreen;

    // Who is in the car next decides whether the stop carries a driver change.
    // An unassigned next stint counts as a change: planning for the swap and
    // not needing it is the harmless direction of the error.
    const nextAssign = assignments[i + 1] ?? { profile: "standard", driverId: null };
    const sameDriver = !!(
      assign.driverId &&
      nextAssign.driverId &&
      assign.driverId === nextAssign.driverId
    );

    let laps = plannedLaps;
    let fuel = laps * fuelPerLapEff;
    let endSec: number;
    let isFinal = false;
    let partial = false;

    if (lapLimited) {
      // Distance race: the flag falls on a lap, so a stint is cut by the laps
      // that are left — never mid-lap.
      const lapsLeft = lapTarget! - lapsDone;
      if (plannedLaps >= lapsLeft) {
        isFinal = true;
        partial = plannedLaps > lapsLeft;
        laps = lapsLeft;
        fuel = laps * fuelPerLapEff;
        greenSec = effLaptime * laps;
      }
    } else if (t + fullGreen >= raceDurationSec) {
      // Timed race: the chequered flag falls during this stint's running.
      isFinal = true;
      partial = true;
      greenSec = raceDurationSec - t;
      laps = effLaptime > 0 ? greenSec / effLaptime : 0;
      fuel = laps * fuelPerLapEff;
    }

    // --- the stop that ends this stint ------------------------------------
    const fuelAtEnd = Math.max(0, fuelAtStart - fuel);
    const tyreEndPct = wearPerLap > 0 ? tyreStartPct - laps * wearPerLap : tyreStartPct;
    const wantsTyres = assign.tyreChange ?? true;
    const requestedFill = assign.fillLitres;
    const litres = Math.max(
      0,
      Math.min(
        usableTank - fuelAtEnd,
        requestedFill != null && requestedFill >= 0 ? requestedFill : usableTank - fuelAtEnd
      )
    );
    let stop: PitStopBreakdown | null = null;
    let stopLoss: number;
    if (model) {
      stop = pitStopSeconds(model, {
        litres,
        tyres: wantsTyres,
        driverChange: !sameDriver,
      });
      stopLoss = stop.totalSec;
    } else {
      // Legacy flat pit loss, minus the swap floor when the same driver stays in.
      stopLoss = Math.max(
        0,
        pitLossSec - (sameDriver ? Math.max(0, driverChangeSaveSec ?? 0) : 0)
      );
    }

    if (lapLimited) {
      // The clock is a consequence here: run the laps, then stop (unless done).
      endSec = t + greenSec + (isFinal ? 0 : stopLoss) + corrSec;
    } else if (isFinal && partial) {
      endSec = raceDurationSec + corrSec; // projected chequered incl. correction
    } else {
      endSec = t + fullGreen + stopLoss + corrSec;
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
      wet: cond === "wet",
      condition: cond,
      weatherDeltaSec: Math.round(wetAdd * 1000) / 1000,
      trafficDeltaSec: Math.round(trafficAdd * 1000) / 1000,
      trackTempC: stintTemp ?? null,
      tempDeltaSec: Math.round(tempAdd * 1000) / 1000,
      stopSec: isFinal ? 0 : stopLoss,
      stop: isFinal ? null : stop,
      tyreChange: isFinal ? false : wantsTyres,
      fuelAtStart,
      fuelAtEnd,
      fillLitres: isFinal ? 0 : litres,
      shortFill: fuelAtStart < usableTank - 1e-6,
      tyreStartPct,
      tyreEndPct,
      tyreWarn: wearPerLap > 0 && tyreMin > 0 && tyreEndPct < tyreMin - 1e-9,
    });

    // Carry fuel + tyres into the next stint.
    lapsDone += laps;
    fuelAtStart = Math.min(usableTank, fuelAtEnd + litres);
    tyreStartPct = wantsTyres ? 100 : tyreEndPct;
    t = endSec;
    i += 1;
    if (lapLimited && isFinal) break;
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
  const raceSec = lapLimited
    ? (stints[stints.length - 1]?.endSec ?? 0)
    : raceDurationSec;
  if (lapLimited && raceStartUtcMs != null) {
    raceEndUtcMs = raceStartUtcMs + raceSec * 1000;
  }
  const stopTimeSec = stints.reduce((a, s) => a + s.stopSec, 0);
  const tyreChanges = stints.filter((s) => s.tyreChange).length;
  const driverCount = drivers.length;
  const fairShareStints =
    driverCount > 0 ? Math.ceil(stints.length / driverCount) : null;

  return {
    template: { standard: stdTpl, saving: savTpl },
    stints,
    raceStartUtcMs,
    raceEndUtcMs,
    raceSec,
    lapLimited,
    lapsShort: lapLimited ? Math.max(0, lapTarget! - lapsDone) : 0,
    totals: {
      stintCount: stints.length,
      pitStops: Math.max(0, stints.length - 1),
      laps,
      fuel,
      driverCount,
      /** Total time standing in / passing through the pits. */
      stopTimeSec,
      /** Number of stops where tyres are changed (= sets used). */
      tyreChanges,
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
  totalLaps: number; // distance measure (higher = better) — timed races
  /** Total race time for the fixed distance (lower = better) — lap races. */
  totalTimeSec: number;
};

export type FuelSaveOptimization =
  | { ok: false; reason: string }
  | {
      ok: true;
      strategies: FuelSaveStrategy[]; // one per stop-count, ascending
      bestIndex: number; // index of the best strategy (most laps / least time)
      fullPushIndex: number; // index of the full-push (fastest lap) strategy
      /** True when the race is decided by distance, so the objective was to
       *  cover the set laps in the least time rather than to cover the most
       *  laps in a set time. */
      lapLimited: boolean;
    };

export function optimizeFuelSave(args: {
  raceDurationSec: number;
  tankSize: number;
  fuelReserve?: number;
  pitLossSec: number;
  standard: FuelProfile; // full push (fast lap, high fuel)
  saving: FuelProfile; // max save (slow lap, low fuel)
  steps?: number;
  /** Optional pace multiplier applied to BOTH profile lap times, so the sweep
   *  reflects the real (stint-weighted) driver-average pace instead of the
   *  Standard profile alone. 1 (default) = use the profiles unchanged.
   *  Because the pit-loss is an absolute time, a slower field genuinely shifts
   *  the optimal stop count — this is why it matters. */
  paceScale?: number;
  /** Measured pit constants. With them the stop is priced from the litres each
   *  strategy actually takes, so saving fuel shortens the stops as well as
   *  stretching the stint — which is exactly when dropping a stop pays off. */
  pitModel?: PitModel | null;
  /** Tyres changed at every stop when pricing with the model (default true). */
  pitTyres?: boolean;
  /** Lap target of a distance race. Given, the sweep looks for the FASTEST way
   *  to cover those laps instead of the greatest distance in a fixed time. */
  raceLaps?: number | null;
  /** Seconds/lap of race-traffic penalty, added to both profiles so the sweep
   *  runs at race pace rather than at practice pace. */
  trafficPenaltySec?: number;
}): FuelSaveOptimization {
  const usable = Math.max(0, args.tankSize - Math.max(0, args.fuelReserve ?? 0));
  const T = args.raceDurationSec;
  const lapTarget = args.raceLaps && args.raceLaps > 0 ? Math.floor(args.raceLaps) : null;
  const k = args.paceScale && args.paceScale > 0 ? args.paceScale : 1;
  const traffic = Math.max(0, args.trafficPenaltySec ?? 0);
  const std: FuelProfile = {
    ...args.standard,
    laptimeSec: args.standard.laptimeSec * k + traffic,
  };
  const sav: FuelProfile = {
    ...args.saving,
    laptimeSec: args.saving.laptimeSec * k + traffic,
  };
  if ((lapTarget == null && T <= 0) || usable <= 0)
    return { ok: false, reason: "Set a race length and tank size." };
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
    // With a pit model the stop costs what refilling THIS stint's fuel costs.
    const P = args.pitModel
      ? pitStopSeconds(args.pitModel, {
          litres: lapsPerStint * F,
          tyres: args.pitTyres ?? true,
          driverChange: true,
        }).totalSec
      : args.pitLossSec;
    const green = L * lapsPerStint;

    // Distance race: run the set laps, count the stops that fit between them.
    if (lapTarget != null) {
      if (lapsPerStint <= 0) {
        return { stops: 0, stints: 0, laptimeSec: L, fuelPerLap: F, lapsPerStint, totalLaps: 0, totalTimeSec: Infinity };
      }
      const stints = Math.ceil(lapTarget / lapsPerStint);
      const stops = Math.max(0, stints - 1);
      return {
        stops,
        stints,
        laptimeSec: L,
        fuelPerLap: F,
        lapsPerStint,
        totalLaps: lapTarget,
        totalTimeSec: lapTarget * L + stops * P,
      };
    }

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
      totalTimeSec: t,
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
    const better = prev
      ? lapTarget != null
        ? r.totalTimeSec < prev.totalTimeSec
        : r.totalLaps > prev.totalLaps
      : true;
    if (better) byStop.set(r.stops, r);
  }
  const strategies = [...byStop.values()].sort((a, b) => a.stops - b.stops);
  if (strategies.length === 0) return { ok: false, reason: "No feasible strategy." };

  let bestIndex = 0;
  let fullPushIndex = 0;
  strategies.forEach((s, i) => {
    const wins =
      lapTarget != null
        ? s.totalTimeSec < strategies[bestIndex].totalTimeSec
        : s.totalLaps > strategies[bestIndex].totalLaps;
    if (wins) bestIndex = i;
    if (s.stops > strategies[fullPushIndex].stops) fullPushIndex = i;
  });
  return { ok: true, strategies, bestIndex, fullPushIndex, lapLimited: lapTarget != null };
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

/** "H:MM:SS" / "MM:SS" / "SS" → seconds. Returns null on empty/invalid.
 *  A decimal comma is accepted: on a German keyboard "8:00,5" is what the
 *  numpad produces, and silently reading that as invalid is worse than useless. */
export function parseDurationToSec(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const parts = t.split(":").map((x) => x.trim());
  if (parts.some((x) => x === "" || isNaN(Number(x)))) return null;
  const nums = parts.map(Number);
  let sec = 0;
  for (const n of nums) sec = sec * 60 + n;
  return sec;
}
