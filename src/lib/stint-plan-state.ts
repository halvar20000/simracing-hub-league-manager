// Serialized stint-planner state (what we persist as JSON) + conversion to the
// pure engine input. Kept out of the "use client" component so Server
// Components (the pages) can build the default state safely.

import {
  parseDurationToSec,
  fmtLap,
  pitStopSeconds,
  conditionOf,
  type StintCondition,
  type FuelProfile,
  type PitModel,
  type PlannerInput,
  type StintMode,
  type StintProfileKey,
} from "@/lib/stint-planner";
import type { G61ImportResult } from "@/lib/garage61-import";
import type { G61Source } from "@/lib/garage61-pool";
import type { StintPref } from "@/lib/stint-autofill";

/** Garage 61 performance analysis saved with a plan (per-driver stats + the
 *  temperature fit) so the dashboard renders on the shared link too. */
export type PlannerG61Analysis = G61ImportResult & {
  generatedAt: string;
  /** Provenance of this analysis, so the tables can say what they are built on
   *  and a pull survives leaving the page. Absent on analyses saved before
   *  v1.77.0 — treat every field as optional. */
  source?: {
    /** "live pull" or "session export". */
    kind: "pull" | "upload";
    /** The window that was asked for ("current season", "last 30 days", …). */
    window?: string | null;
    /** Laps Garage 61 returned before the roster/clean filtering. */
    lapsFetched?: number | null;
    /** Laps dropped for being older than the window. */
    lapsTooOld?: number | null;
    /** Date range of the laps actually used (ms since epoch). */
    oldestLapMs?: number | null;
    newestLapMs?: number | null;
    trackMatched?: string | null;
    carMatched?: string | null;
  };
};

export type PlannerDriverState = {
  id: string;
  name: string;
  laptime: string; // "" = use standard profile pace
  /** Per-driver fuel consumption in l/lap; "" = use the profile's figure.
   *  A smooth driver really does get a lap more out of the same tank. */
  fuelPerLap?: string;
  /** Per-driver tyre wear in % per lap; "" = use the plan's default. */
  tyreWear?: string;
  /** How much slower THIS driver is on a fuel-save stint, in seconds/lap;
   *  "" = use the plan's default (Fuel-saving minus Standard profile).
   *  Lifting and coasting is a skill — one driver's 0.6 s buys the same litres
   *  another one pays 1.4 s for, and averaging that away costs a stint. */
  savingSec?: string;
  /** How much fuel THIS driver saves on a fuel-save stint, in litres/lap;
   *  "" = use the plan's default. */
  savingFuel?: string;
  /** Which of the three figures the team typed in by hand. A Garage 61 pull
   *  fills the others and leaves these alone — a hand-tuned number must not be
   *  silently overwritten by the next import. */
  manual?: { laptime?: boolean; fuelPerLap?: boolean; tyreWear?: boolean };
  /** What this driver would rather do. Used by the automatic line-up only —
   *  never by a hand-picked seat, and never mid-race. Empty = no preference. */
  prefNight?: StintPref; // real wall-clock night (the plan's local time)
  prefRain?: StintPref; // stints marked half wet / wet
  prefStart?: StintPref; // being in the car at the green flag
  /** Most stints in a row this driver wants; "" = no limit stated. */
  maxConsecutive?: string;
};

/** One row of the parsed eventresult finishing order (stored in the payload so
 *  the shared plan renders the table without re-fetching the raw JSON). */
export type ResultRow = {
  pos: number | null; // classified finishing position, null for DNF/DNS/DSQ
  status: string; // CLASSIFIED | DNF | DNS | DSQ
  /** Team name for team events, driver name for solo events. */
  name: string;
  carNumber: string | null;
  car: string | null;
  laps: number;
  incidents: number;
  /** Multiclass: car class short name (e.g. "GTP"), when known. */
  carClass?: string | null;
  /** Multiclass: 1-based position in class, when known. */
  classPos?: number | null;
  /** Team events: the drivers who took a stint for this entry. */
  drivers?: string[];
  /** Best lap of the entry in ms, when known. */
  bestLapMs?: number | null;
  /** True for the plan's own entry (matched by driver name). */
  own?: boolean;
};

/** One team driver's measured performance from the race-logger JSONL.
 *  Only drivers who actually sat in OUR car are kept — the log is a
 *  team-performance comparison, not a field-wide result sheet. */
export type RaceLogDriverRow = {
  driver: string;
  /** Index into the plan's colour slots (stable per driver, 0-based). */
  slot: number;
  laps: number; // laps with a usable lap time
  bestSec: number | null;
  avgSec: number | null; // mean of all timed laps
  greenSec: number | null; // median of laps within +5% of the driver's best
  medianSec: number | null;
  /** Spread of the green laps (p90 − best), in seconds — consistency. */
  spreadSec: number | null;
  incidents: number;
  stints: number;
  pits: number;
  /** True when the driver is also listed on the plan's roster. */
  onRoster: boolean;
};

/**
 * Why a lap is left out of the average.
 *
 *   form    — before the green flag: pace/formation lap
 *   start   — the first lap after the green: a standing/rolling start is not
 *             a representative lap and never was
 *   in      — the lap that ended in the pits
 *   out     — the lap back out of the pits
 *   fcy     — the lap ran (wholly or partly) under a FULL COURSE yellow
 *   restart — the first lap after the caution went green again
 *
 * A local waved yellow is NOT a caution and never marks a lap: iRacing throws
 * `yellow_waving` at a single corner for one incident, often with no green
 * afterwards at all (verified on the Le Mans 05.09. log: one waved yellow at
 * t=846 s and no further green — treating it as a full-course yellow would
 * have thrown away the rest of the race). Only `caution` (raw bit 16384)
 * opens a caution window.
 */
export type LapExclusion = "form" | "start" | "in" | "out" | "fcy" | "restart";

/** One lap of our car, for the lap-time trace. */
export type RaceLogLap = {
  lap: number;
  sec: number;
  /** Index into PlannerRaceLog.drivers. */
  d: number;
  /** Session clock when the lap was completed, in seconds from session start.
   *  This is what lets a lap be matched to a stint of the plan. */
  t?: number;
  /** Lap ended with a pit stop. */
  pit?: boolean;
  /** Set when the lap does not belong in an average, and why. Absent = a
   *  proper racing lap. Only written by parser generation 2 and later — see
   *  PlannerRaceLog.exclV. */
  x?: LapExclusion;
};

/** One stint of the plan's own car, derived from the log's pit events. */
export type RaceLogStintRow = {
  carNumber: string | null;
  index: number; // 1-based stint number
  startLap: number | null;
  endLap: number | null;
  /** Session clock of the first and last lap of the stint, in seconds. */
  startSec?: number | null;
  endSec?: number | null;
  laps: number;
  drivers: string[];
  /** Index of the driver who ran most of the stint. */
  d: number;
  avgSec: number | null;
  pitSec: number | null; // pit-stop duration that ENDED this stint
};

/** Archived + parsed race-logger JSONL attached to a plan. */
export type PlannerRaceLog = {
  url: string; // Vercel Blob URL of the raw .jsonl
  name: string;
  parsedAt: string;
  track: string | null;
  sessionName: string | null;
  official: boolean | null;
  trackTempC: number | null;
  airTempC: number | null;
  /** Our car's number and class, when identified from the roster. */
  ownCarNumber: string | null;
  ownCarClass: string | null;
  /** Fastest lap in our class — the reference line on every chart. */
  classBestSec: number | null;
  /** Fastest lap of the whole field, in seconds. */
  fieldBestSec: number | null;
  drivers: RaceLogDriverRow[];
  laps: RaceLogLap[];
  stints: RaceLogStintRow[];
  /**
   * Which generation of the parser produced this trace.
   *
   * Absent/1 = the original parser: laps carry no `x` marks, so the dashboard
   * has to fall back to spotting in/out laps itself and cannot know about the
   * formation lap or the cautions. 2 = laps are marked (see RaceLogLap.x).
   * A plan uploaded before this can be brought up to date with the
   * "Re-analyse" button — the raw .jsonl is still in the archive.
   */
  exclV?: number;
};

/** One of OUR drivers as iRacing scored them. In a team event this is the
 *  only trustworthy per-driver split: the race logger reports a single driver
 *  name per car for the whole race, so it cannot separate the stints. */
export type TeamDriverStat = {
  name: string;
  custId: number;
  laps: number;
  bestSec: number | null;
  /** Lap number of that best lap — anchors the driver to a point in the race. */
  bestLapNum: number | null;
  avgSec: number | null;
  incidents: number;
  /** The iRating the driver STARTED the race with (`oldi_rating`), when the
   *  results file carries it. Used to interpolate this driver's target lap
   *  time from a pace curve — see src/lib/pace-reference.ts. */
  iRating: number | null;
};

/** Default lead time for the "you're up next" Discord DM, in minutes. */
export const DEFAULT_ALERT_LEAD_MIN = 15;

/** Most pictures a plan will hold — keeps the payload and the page sane. */
export const MAX_IMPRESSIONS = 20;

/** A picture kept with the plan: the finisher's certificate/poster, or one of
 *  the shots the team took during the race. */
export type PlannerImage = {
  url: string; // Vercel Blob URL
  name: string; // original file name
  caption?: string; // optional, free text
  uploadedAt: string; // ISO timestamp
};

/** Archived + parsed end-of-session eventresult attached to a plan. */
export type PlannerEventResult = {
  url: string; // Vercel Blob URL of the raw eventresult.json
  name: string; // original file name
  summary: ResultRow[];
  parsedAt: string; // ISO timestamp
  /** Our own entry's drivers (team events only), in iRacing's order. */
  ownDrivers?: TeamDriverStat[];
  /** Our own entry's car number, for matching the race log. */
  ownCarNumber?: string | null;
};
export type PlannerAssignmentState = {
  profile: StintProfileKey;
  driverId: string | null;
  correctionMin?: number; // live ± minutes for this stint (cascades forward)
  spotterId?: string | null; // driver spotting this stint (never the stint driver)
  note?: string; // free-text stint comment (incident, weather, SC, …)
  /** Track condition: "half" = damp/drying, "wet" = full wet. */
  condition?: StintCondition;
  wet?: boolean; // legacy full-wet flag (plans saved before half-wet existed)
  /** Track temperature for this stint in °C; empty = run at the plan's base
   *  temperature (the Track temp field), i.e. no correction at all. */
  trackTempC?: number | null;
  /** Tyres changed at the stop that ENDS this stint. Undefined = yes. */
  tyreChange?: boolean;
  /** Litres taken at that stop; null/undefined = fill the tank. A smaller
   *  number is a splash — shorter stop, shorter following stint. */
  fillLitres?: number | null;
  /** Laps actually run in this stint, typed in by the team. Null/undefined =
   *  whatever the model computes. For the stint that ended early (damage,
   *  shortcut) or ran a lap long. */
  lapsOverride?: number | null;
};

/** Track-temperature pace model. The Standard + per-driver lap times stored on
 *  the plan represent pace at `appliedTempC`; changing the race track temp
 *  shifts them by `slopePerC × Δtemp`. `slopePerC` comes from a Garage 61 data
 *  fit when available (`fromData`), otherwise from the editable `manualSlopePerC`. */
export type TempModel = {
  appliedTempC: number | null;
  slopePerC: number;
  fromData: boolean;
  manualSlopePerC: number;
};

/** Default lap-time sensitivity when there's no data fit: 1.0 s per 10 °C. */
export const DEFAULT_TEMP_SLOPE_PER_C = 0.1;

/** Wet-weather scenario. The stored lap times carry `appliedDeltaSec` extra
 *  seconds/lap (0 when dry); toggling Dry/Wet shifts them by the difference.
 *  `deltaSec` is the effective wet penalty (measured from data when available,
 *  else the editable `manualDeltaSec`). */
export type WetModel = {
  /** Full-wet penalty in s/lap (measured from data when available). */
  deltaSec: number;
  fromData: boolean;
  manualDeltaSec: number;
  /** Half-wet (damp / drying) penalty in s/lap. Null = derive it from the full
   *  wet penalty with DEFAULT_HALF_WET_FRACTION — a damp track costs a good
   *  part of full wet, but nowhere near all of it. */
  manualHalfDeltaSec?: number | null;
  wetFuelPerLap: number | null;
  appliedDeltaSec: number;
};

/** Default wet penalty when there's no measured wet data: +12 s/lap. */
export const DEFAULT_WET_DELTA_SEC = 12;

/** A damp / drying track costs this share of the full-wet penalty by default. */
export const DEFAULT_HALF_WET_FRACTION = 0.45;

/** The half-wet penalty of a plan: the entered value, else a share of full wet. */
export function halfWetDeltaSec(s: PlannerState): number {
  const manual = s.wetModel?.manualHalfDeltaSec;
  if (manual != null && isFinite(manual) && manual >= 0) return manual;
  const full = s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC;
  return full * DEFAULT_HALF_WET_FRACTION;
}
export type PlannerState = {
  title: string;
  event: {
    track: string; // CLS track name (display string), "" = none
    car: string; // CLS car name, "" = none
    /** How the race ends: on the clock, on a lap count, or on a distance. */
    raceLimit: "time" | "laps" | "distance";
    raceDuration: string; // "6:00:00" — used when raceLimit = "time"
    /** Finish a TIMED race on a whole lap plus the lap iRacing runs after the
     *  clock expires (Johann's rule), instead of cutting the last stint at the
     *  exact second. On for new plans; plans saved before this keep the old
     *  finish, so an archived plan re-opens with the schedule it was signed
     *  off with. */
    roundRaceEnd: boolean;
    /** Lap target when raceLimit = "laps" (e.g. "500"). */
    raceLaps: string;
    /** Distance when raceLimit = "distance" (e.g. "1000"), in `distanceUnit`. */
    raceDistance: string;
    distanceUnit: "km" | "mi";
    /** Length of one lap in km — turns a distance into a lap target. */
    lapDistanceKm: string;
    greenFlagOffset: string; // "0:30"
    pitLoss: string; // seconds, "70"
    tankSize: string; // litres, "75"
    sessionStartLocal: string; // datetime-local value, "" = none
    stintMode: StintMode; // "fuel" (default) | "time" | "laps"
    stintValue: string; // minutes (time) or laps (laps); ignored for fuel
    fuelReserve: string; // litres kept in reserve, "" = 0
    /** How far back a Garage 61 pull looks. Garage 61's own codes: "-1" =
     *  current season, "-2" = current + previous, a positive number = days,
     *  "" = everything. Default: the current season — old pace from a car that
     *  has since been BoP'd is worse than no data. */
    g61Age: string;
    /** Seconds per lap the team is slower in a race than in practice: traffic,
     *  cars to pass, dirty air, being careful. Practice data is optimistic, so
     *  this is added to every stint. "" = 0. */
    trafficPenaltySec: string;
    /** Litres burned from leaving the box to the green flag (lap to the grid +
     *  laps behind the pace car). Off the FIRST stint only — that fuel is gone
     *  before the race starts. "" = 0. */
    gridFuelL: string;
    trackTempC: string; // race-day track temperature (°C), "" = none
    conditions: "dry" | "wet"; // whole-race weather scenario (legacy, vestigial)
    /**
     * League race or an iRacing OFFICIAL race — it changes what the post-race
     * analysis measures against, and nothing else.
     *
     * In a league everyone runs the same car at roughly the same level, so the
     * fastest man in class is a fair yardstick. In an official race the field
     * is whatever iRating showed up, and the class best then says nothing
     * about whether a 1500 iR driver drove well. "official" unlocks the two
     * fields below and switches the debrief to measuring each driver against
     * what his OWN iRating was worth.
     */
    raceKind: "league" | "official";
    /** Official races: the lap time a very strong (≈10k iR) driver sets here —
     *  a fixed yardstick that does not move with the day's entry list, so the
     *  same number is comparable across races and across a season. Accepts
     *  "1:58.775" or plain seconds; "" = none. */
    refLap: string;
    /** Official races: id of the pace curve (iRating → lap time) from the
     *  shared library this plan compares against. "" = none chosen. */
    paceCurveId: string;
    /** Wall-clock hours (plan's local time) the automatic line-up treats as
     *  night, for the drivers who said they prefer or avoid driving then. */
    nightFromHour: string; // "23"
    nightToHour: string; // "6"
    driverSwapSec: string; // mandatory driver-swap floor (iRacing = 30s)
    alertLeadMin: string; // minutes before a stint the driver gets a Discord DM
    refuelSec: string; // refuel service time per stop, "" = unknown
    doubleStint: boolean; // auto-fill drivers in double-stint pairs

    // --- measured pit model (Tier 1) ---------------------------------------
    // With `pitModelOn` every stop is computed from the litres actually taken,
    // whether tyres are changed and whether the driver changes, instead of the
    // single flat `pitLoss`. The constants come from a test session (see the
    // pit-reference library) — measure once per car + track, reuse forever.
    pitModelOn: boolean;
    /** Time lost entering, stopping and leaving WITHOUT service, in seconds. */
    pitLaneLossSec: string;
    /** Refuel rate in litres per second (GT3 ≈ 2.5, LMP ≈ 1.81). */
    refuelLps: string;
    /** Tyre change duration in seconds (≈ 20). */
    tyreChangeSec: string;
    /** True when the tyre change adds to the refuel time instead of overlapping. */
    tyreSequential: boolean;
    /** Default tyre wear in % per lap for drivers without their own figure. */
    tyreWearPctPerLap: string;
    /** Lowest tyre condition (%) still considered raceable; stints ending
     *  below it are flagged. "" = don't check. */
    tyreMinPct: string;
  };
  /** The roster default: the pace and consumption used for any driver who has
   *  no figures of their own. In delta mode this is a fallback, not the plan. */
  standard: { laptime: string; fuelPerLap: string };
  savingEnabled: boolean;
  /** How a fuel-save stint is derived — see `PlannerInput.savingMode`.
   *  "delta" (the default for new plans) computes every stint from the
   *  DRIVER's own average lap time and fuel and adds `savingDelta` on top for
   *  an FS stint. "absolute" is the legacy pair of profile values and is what
   *  every plan saved before this existed keeps, so an archived plan re-opens
   *  with exactly the numbers it was signed off with. */
  savingMode: "delta" | "absolute";
  /** The fuel-saving profile. In legacy mode these ARE the numbers a fuel-save
   *  stint runs on. In delta mode they are the roster default: the difference
   *  to `standard` is the effort (+s/lap, −L/lap) applied to each driver's own
   *  figures, for every driver who has not typed their own. */
  saving: { laptime: string; fuelPerLap: string };
  drivers: PlannerDriverState[];
  assignments: PlannerAssignmentState[];
  /** Track-temperature pace model, or null until data/temp is set. */
  tempModel: TempModel | null;
  /** Wet-weather scenario model, or null until data/rain is set. */
  wetModel: WetModel | null;
  /** Saved Garage 61 performance analysis for the dashboard, or null. */
  g61Analysis: PlannerG61Analysis | null;
  /** The raw laps behind that analysis, one entry per import. Empty on plans
   *  saved before the pool existed — the analysis they carry is still shown,
   *  it simply cannot be added to until the next import. */
  g61Sources: G61Source[];
  /** Add the next import to the pool instead of replacing it. Off by default:
   *  a fresh import that quietly inherited three-week-old laps would be worse
   *  than one that quietly threw them away. */
  g61Cumulative: boolean;
  /** Driver availability: driverId → race-hour indices (0-based) the driver is
   *  NOT available. Missing/empty = available all race (the default). */
  availability: Record<string, number[]>;
  /** Free-text team notes shown on the plan (saved with it). */
  notes: { pre: string; during: string; post: string };
  /** Archived + parsed end-of-session eventresult, or null. */
  eventResult: PlannerEventResult | null;
  /** Archived + parsed race-logger JSONL, or null. */
  raceLog: PlannerRaceLog | null;
  /** Send the next driver a Discord DM before their stint. Off by default —
   *  a plan that gets opened months later must not start DMing people. */
  alertsEnabled: boolean;
  /** Stint index (as a string key) → ISO time the DM went out. Lives in the
   *  payload so two pit-wall tabs can't double-alert. */
  alertsSent: Record<string, string>;
  /** The result poster / certificate for this race, or null. */
  poster: PlannerImage | null;
  /** Impressions from the race — livery shots, screenshots, podium pictures. */
  impressions: PlannerImage[];
};

let uidCounter = 0;
export const uid = () =>
  `d${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function defaultPlannerState(): PlannerState {
  return {
    title: "6h Road America",
    event: {
      track: "",
      car: "",
      raceLimit: "time",
      raceDuration: "6:00:00",
      roundRaceEnd: true,
      raceLaps: "",
      raceDistance: "",
      distanceUnit: "km",
      lapDistanceKm: "",
      greenFlagOffset: "0:00",
      pitLoss: "70",
      tankSize: "75",
      sessionStartLocal: "",
      stintMode: "fuel",
      stintValue: "",
      fuelReserve: "",
      gridFuelL: "",
      trafficPenaltySec: "",
      g61Age: "-1",
      trackTempC: "",
      conditions: "dry",
      raceKind: "league",
      refLap: "",
      paceCurveId: "",
      nightFromHour: "23",
      nightToHour: "6",
      driverSwapSec: "30",
      alertLeadMin: String(DEFAULT_ALERT_LEAD_MIN),
      refuelSec: "",
      doubleStint: false,
      pitModelOn: false,
      pitLaneLossSec: "",
      refuelLps: "",
      tyreChangeSec: "",
      tyreSequential: true,
      tyreWearPctPerLap: "",
      tyreMinPct: "",
    },
    standard: { laptime: "1:55", fuelPerLap: "3.29" },
    savingEnabled: false,
    savingMode: "delta",
    saving: { laptime: "1:56", fuelPerLap: "3.20" },
    drivers: [],
    assignments: [],
    tempModel: null,
    wetModel: null,
    g61Analysis: null,
    g61Sources: [],
    g61Cumulative: false,
    availability: {},
    notes: { pre: "", during: "", post: "" },
    eventResult: null,
    raceLog: null,
    alertsEnabled: false,
    alertsSent: {},
    poster: null,
    impressions: [],
  };
}

/** Merge a stored payload (+title) over the current defaults into a full
 *  PlannerState. Used both by the server page and the live auto-refresh so a
 *  plan saved by an older build always opens cleanly. */
export function hydratePlanState(payload: unknown, title: string): PlannerState {
  const base = defaultPlannerState();
  const stored = (payload ?? {}) as Partial<PlannerState>;
  const migrated = unshiftLegacyGlobalWet(stored);
  return {
    ...base,
    ...migrated,
    title,
    event: {
      ...base.event,
      ...(migrated.event ?? {}),
      // Same rule as `savingMode` below: a stored plan keeps the finish it was
      // built with. Only a payload with no `event` at all is a brand-new plan
      // and takes the default (on).
      roundRaceEnd:
        migrated.event?.roundRaceEnd ??
        (migrated.event ? false : base.event.roundRaceEnd),
    },
    // A plan saved before the delta model keeps the absolute pair: an archived
    // plan must re-open with exactly the schedule it was signed off with, and
    // a live plan must not silently re-time itself under the team. A payload
    // with no `standard` at all is a brand-new plan, so it takes the default.
    savingMode:
      migrated.savingMode ?? (migrated.standard ? "absolute" : base.savingMode),
    notes: { ...base.notes, ...(stored.notes ?? {}) },
    // A plan saved before the lap pool has an analysis but no laps behind it.
    g61Sources: stored.g61Sources ?? base.g61Sources,
    g61Cumulative: stored.g61Cumulative ?? base.g61Cumulative,
    availability: stored.availability ?? base.availability,
    impressions: stored.impressions ?? base.impressions,
    alertsSent: stored.alertsSent ?? base.alertsSent,
  };
}

/** One-time migration: v1.50 had a whole-race Dry/Wet toggle that shifted the
 *  stored lap times by the wet penalty (`wetModel.appliedDeltaSec`). Per-stint
 *  wet (v1.51) applies the penalty in the engine instead, so bring any globally
 *  shifted lap times back to the dry baseline and clear the applied delta. */
function unshiftLegacyGlobalWet(
  stored: Partial<PlannerState>
): Partial<PlannerState> {
  const wm = stored.wetModel;
  const applied = wm?.appliedDeltaSec ?? 0;
  if (!applied || applied <= 0) return stored;
  const shiftStr = (str?: string): string => {
    if (!str || str.trim() === "") return str ?? "";
    const sec = parseDurationToSec(str);
    if (sec == null) return str;
    return fmtLap(Math.max(0, sec - applied));
  };
  return {
    ...stored,
    event: stored.event ? { ...stored.event, conditions: "dry" } : stored.event,
    standard: stored.standard
      ? { ...stored.standard, laptime: shiftStr(stored.standard.laptime) }
      : stored.standard,
    saving: stored.saving
      ? { ...stored.saving, laptime: shiftStr(stored.saving.laptime) }
      : stored.saving,
    drivers: stored.drivers
      ? stored.drivers.map((d) =>
          d.laptime?.trim() ? { ...d, laptime: shiftStr(d.laptime) } : d
        )
      : stored.drivers,
    wetModel: wm ? { ...wm, appliedDeltaSec: 0 } : wm,
  };
}

/**
 * Read a number the team typed. Accepts a decimal comma — half the paddock is
 * German and types "12,5"; `Number("12,5")` is NaN, which used to turn a filled
 * field into a silent zero (the fuel-save optimiser then refused to run with
 * "fill in both fuel profiles first" while both were plainly filled).
 */
export const parseTypedNumber = (s: string | null | undefined, fallback = 0): number => {
  const raw = String(s ?? "").trim().replace(",", ".");
  // An empty field means "use the default", not "zero" — clearing the driver
  // swap must not silently remove the 30 s floor.
  if (raw === "") return fallback;
  const n = Number(raw);
  return isFinite(n) ? n : fallback;
};
const num = parseTypedNumber;

/** Parse the string-based UI state into the numeric engine input. */
/** Miles → km, for the distance limit. */
const MI_TO_KM = 1.609344;

/**
 * The lap target of a plan, or null for a timed race. A distance race is run
 * until the distance is COVERED, so the laps round up — 1000 km at 7.004 km a
 * lap is 143 laps, not 142.
 */
export function planLapTarget(s: PlannerState): number | null {
  if (s.event.raceLimit === "laps") {
    const n = Math.floor(num(s.event.raceLaps));
    return n > 0 ? n : null;
  }
  if (s.event.raceLimit === "distance") {
    const lap = num(s.event.lapDistanceKm);
    const dist =
      num(s.event.raceDistance) * (s.event.distanceUnit === "mi" ? MI_TO_KM : 1);
    if (lap <= 0 || dist <= 0) return null;
    return Math.ceil(dist / lap);
  }
  return null;
}

/** Whether a plan derives its fuel-save stints from each driver's own numbers.
 *  Plans saved before the delta model exist and hydrate as "absolute". */
export function isDeltaSaving(s: PlannerState): boolean {
  return (s.savingMode ?? "absolute") === "delta";
}

/** The fuel-saving profile of a plan, or null when saving is off. */
export function savingProfileOf(s: PlannerState): FuelProfile | null {
  if (!s.savingEnabled) return null;
  return {
    laptimeSec: parseDurationToSec(s.saving.laptime) ?? 0,
    fuelPerLap: num(s.saving.fuelPerLap),
  };
}

/**
 * The plan's DEFAULT fuel-save effort: how much slower and how much thriftier
 * the Fuel-saving profile is than Standard. In delta mode this is what a driver
 * without their own delta columns saves — so the profile pair the team already
 * maintains keeps earning its keep instead of being replaced by yet another
 * pair of fields.
 */
export function savingDeltas(s: PlannerState): { sec: number; litres: number } {
  const sav = savingProfileOf(s);
  if (!sav) return { sec: 0, litres: 0 };
  const stdLap = parseDurationToSec(s.standard.laptime) ?? 0;
  const stdFuel = num(s.standard.fuelPerLap);
  return {
    sec: Math.max(0, sav.laptimeSec - stdLap),
    litres: Math.max(0, stdFuel - sav.fuelPerLap),
  };
}

export function stateToInput(s: PlannerState): PlannerInput {
  const sessionMs =
    s.event.sessionStartLocal.trim() !== ""
      ? new Date(s.event.sessionStartLocal).getTime()
      : null;
  return {
    raceDurationSec: parseDurationToSec(s.event.raceDuration) ?? 0,
    raceLaps: planLapTarget(s),
    greenFlagOffsetSec: parseDurationToSec(s.event.greenFlagOffset) ?? 0,
    pitLossSec: num(s.event.pitLoss),
    tankSize: num(s.event.tankSize),
    standard: {
      laptimeSec: parseDurationToSec(s.standard.laptime) ?? 0,
      fuelPerLap: num(s.standard.fuelPerLap),
    },
    saving: savingProfileOf(s),
    savingMode: isDeltaSaving(s) ? "delta" : "absolute",
    savingDeltaSec: savingDeltas(s).sec,
    savingFuelDelta: savingDeltas(s).litres,
    sessionStartUtcMs: sessionMs && isFinite(sessionMs) ? sessionMs : null,
    stintMode: s.event.stintMode,
    stintSec:
      s.event.stintMode === "time" ? num(s.event.stintValue) * 60 : undefined,
    stintLaps:
      s.event.stintMode === "laps" ? num(s.event.stintValue) : undefined,
    fuelReserve: num(s.event.fuelReserve),
    gridFuelL: num(s.event.gridFuelL),
    drivers: s.drivers.map((d) => ({
      id: d.id,
      name: d.name || "Driver",
      laptimeSec: d.laptime.trim() ? parseDurationToSec(d.laptime) : null,
      fuelPerLap: d.fuelPerLap?.trim() ? num(d.fuelPerLap) : null,
      tyreWearPctPerLap: d.tyreWear?.trim() ? num(d.tyreWear) : null,
      savingDeltaSec: d.savingSec?.trim() ? num(d.savingSec) : null,
      savingFuelDelta: d.savingFuel?.trim() ? num(d.savingFuel) : null,
    })),
    assignments: s.assignments.map((a) => ({
      profile: a.profile,
      driverId: a.driverId,
      correctionMin: a.correctionMin ?? 0,
      condition: conditionOf(a),
      wet: a.wet ?? false,
      trackTempC: a.trackTempC ?? null,
      tyreChange: a.tyreChange ?? true,
      fillLitres: a.fillLitres ?? null,
      lapsOverride: a.lapsOverride ?? null,
    })),
    // Only a timed race can be rounded up to a whole lap — a distance race
    // already ends on one.
    roundRaceEnd: s.event.raceLimit === "time" && s.event.roundRaceEnd === true,
    // Fall back to the default wet penalty when no Garage 61 rain model exists,
    // so ticking a stint wet still lengthens it (the field shows this default).
    wetDeltaSec: s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC,
    halfWetDeltaSec: halfWetDeltaSec(s),
    trafficPenaltySec: num(s.event.trafficPenaltySec),
    // Per-stint temperatures are measured against the plan's Track temp, using
    // the Garage 61 fit when there is one and the manual slope otherwise.
    baseTempC:
      s.event.trackTempC.trim() !== "" && isFinite(Number(s.event.trackTempC))
        ? Number(s.event.trackTempC)
        : null,
    tempSlopePerC: s.tempModel?.slopePerC ?? DEFAULT_TEMP_SLOPE_PER_C,
    driverChangeSaveSec:
      s.event.refuelSec.trim() !== ""
        ? Math.max(0, num(s.event.driverSwapSec, 30) - num(s.event.refuelSec))
        : 0,
    pitModel: planPitModel(s),
    tyreWearPctPerLap: num(s.event.tyreWearPctPerLap),
    tyreMinPct: num(s.event.tyreMinPct),
  };
}

/**
 * The measured pit model of a plan, or null when the plan still uses the flat
 * pit loss. Requires the switch AND a lane loss — without that number there is
 * nothing to compute a stop from.
 */
export function planPitModel(s: PlannerState): PitModel | null {
  if (!s.event.pitModelOn) return null;
  const laneLossSec = num(s.event.pitLaneLossSec);
  if (laneLossSec <= 0) return null;
  return {
    laneLossSec,
    refuelLps: num(s.event.refuelLps),
    tyreChangeSec: num(s.event.tyreChangeSec),
    driverChangeSec: num(s.event.driverSwapSec, 30),
    tyreSequential: s.event.tyreSequential !== false,
  };
}

/**
 * What one full-service stop costs on this plan — the number to show next to
 * "pit loss" and to feed the fuel-save optimizer when it is not given the model
 * itself. Falls back to the flat field when there is no model.
 */
export function fullServiceStopSec(s: PlannerState): number {
  const model = planPitModel(s);
  if (!model) return num(s.event.pitLoss);
  const usable = Math.max(0, num(s.event.tankSize) - num(s.event.fuelReserve));
  return pitStopSeconds(model, { litres: usable, tyres: true, driverChange: true }).totalSec;
}
