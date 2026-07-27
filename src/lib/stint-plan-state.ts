// Serialized stint-planner state (what we persist as JSON) + conversion to the
// pure engine input. Kept out of the "use client" component so Server
// Components (the pages) can build the default state safely.

import {
  parseDurationToSec,
  fmtLap,
  type PlannerInput,
  type StintMode,
  type StintProfileKey,
} from "@/lib/stint-planner";
import type { G61ImportResult } from "@/lib/garage61-import";

/** Garage 61 performance analysis saved with a plan (per-driver stats + the
 *  temperature fit) so the dashboard renders on the shared link too. */
export type PlannerG61Analysis = G61ImportResult & { generatedAt: string };

export type PlannerDriverState = {
  id: string;
  name: string;
  laptime: string; // "" = use standard profile pace
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
};

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
  wet?: boolean; // this stint runs in the wet (adds the wet penalty per lap)
  /** Track temperature for this stint in °C; empty = run at the plan's base
   *  temperature (the Track temp field), i.e. no correction at all. */
  trackTempC?: number | null;
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
  deltaSec: number;
  fromData: boolean;
  manualDeltaSec: number;
  wetFuelPerLap: number | null;
  appliedDeltaSec: number;
};

/** Default wet penalty when there's no measured wet data: +12 s/lap. */
export const DEFAULT_WET_DELTA_SEC = 12;
export type PlannerState = {
  title: string;
  event: {
    track: string; // CLS track name (display string), "" = none
    car: string; // CLS car name, "" = none
    raceDuration: string; // "6:00:00"
    greenFlagOffset: string; // "0:30"
    pitLoss: string; // seconds, "70"
    tankSize: string; // litres, "75"
    sessionStartLocal: string; // datetime-local value, "" = none
    stintMode: StintMode; // "fuel" (default) | "time" | "laps"
    stintValue: string; // minutes (time) or laps (laps); ignored for fuel
    fuelReserve: string; // litres kept in reserve, "" = 0
    trackTempC: string; // race-day track temperature (°C), "" = none
    conditions: "dry" | "wet"; // whole-race weather scenario (legacy, vestigial)
    driverSwapSec: string; // mandatory driver-swap floor (iRacing = 30s)
    refuelSec: string; // refuel service time per stop, "" = unknown
    doubleStint: boolean; // auto-fill drivers in double-stint pairs
  };
  standard: { laptime: string; fuelPerLap: string };
  savingEnabled: boolean;
  saving: { laptime: string; fuelPerLap: string };
  drivers: PlannerDriverState[];
  assignments: PlannerAssignmentState[];
  /** Track-temperature pace model, or null until data/temp is set. */
  tempModel: TempModel | null;
  /** Wet-weather scenario model, or null until data/rain is set. */
  wetModel: WetModel | null;
  /** Saved Garage 61 performance analysis for the dashboard, or null. */
  g61Analysis: PlannerG61Analysis | null;
  /** Driver availability: driverId → race-hour indices (0-based) the driver is
   *  NOT available. Missing/empty = available all race (the default). */
  availability: Record<string, number[]>;
  /** Free-text team notes shown on the plan (saved with it). */
  notes: { pre: string; during: string; post: string };
  /** Archived + parsed end-of-session eventresult, or null. */
  eventResult: PlannerEventResult | null;
  /** Archived + parsed race-logger JSONL, or null. */
  raceLog: PlannerRaceLog | null;
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
      raceDuration: "6:00:00",
      greenFlagOffset: "0:00",
      pitLoss: "70",
      tankSize: "75",
      sessionStartLocal: "",
      stintMode: "fuel",
      stintValue: "",
      fuelReserve: "",
      trackTempC: "",
      conditions: "dry",
      driverSwapSec: "30",
      refuelSec: "",
      doubleStint: false,
    },
    standard: { laptime: "1:55", fuelPerLap: "3.29" },
    savingEnabled: false,
    saving: { laptime: "1:56", fuelPerLap: "3.20" },
    drivers: [],
    assignments: [],
    tempModel: null,
    wetModel: null,
    g61Analysis: null,
    availability: {},
    notes: { pre: "", during: "", post: "" },
    eventResult: null,
    raceLog: null,
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
    event: { ...base.event, ...(migrated.event ?? {}) },
    notes: { ...base.notes, ...(stored.notes ?? {}) },
    availability: stored.availability ?? base.availability,
    impressions: stored.impressions ?? base.impressions,
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

const num = (s: string, fallback = 0): number => {
  const n = Number(String(s).trim());
  return isFinite(n) ? n : fallback;
};

/** Parse the string-based UI state into the numeric engine input. */
export function stateToInput(s: PlannerState): PlannerInput {
  const sessionMs =
    s.event.sessionStartLocal.trim() !== ""
      ? new Date(s.event.sessionStartLocal).getTime()
      : null;
  return {
    raceDurationSec: parseDurationToSec(s.event.raceDuration) ?? 0,
    greenFlagOffsetSec: parseDurationToSec(s.event.greenFlagOffset) ?? 0,
    pitLossSec: num(s.event.pitLoss),
    tankSize: num(s.event.tankSize),
    standard: {
      laptimeSec: parseDurationToSec(s.standard.laptime) ?? 0,
      fuelPerLap: num(s.standard.fuelPerLap),
    },
    saving: s.savingEnabled
      ? {
          laptimeSec: parseDurationToSec(s.saving.laptime) ?? 0,
          fuelPerLap: num(s.saving.fuelPerLap),
        }
      : null,
    sessionStartUtcMs: sessionMs && isFinite(sessionMs) ? sessionMs : null,
    stintMode: s.event.stintMode,
    stintSec:
      s.event.stintMode === "time" ? num(s.event.stintValue) * 60 : undefined,
    stintLaps:
      s.event.stintMode === "laps" ? num(s.event.stintValue) : undefined,
    fuelReserve: num(s.event.fuelReserve),
    drivers: s.drivers.map((d) => ({
      id: d.id,
      name: d.name || "Driver",
      laptimeSec: d.laptime.trim() ? parseDurationToSec(d.laptime) : null,
    })),
    assignments: s.assignments.map((a) => ({
      profile: a.profile,
      driverId: a.driverId,
      correctionMin: a.correctionMin ?? 0,
      wet: a.wet ?? false,
      trackTempC: a.trackTempC ?? null,
    })),
    // Fall back to the default wet penalty when no Garage 61 rain model exists,
    // so ticking a stint wet still lengthens it (the field shows this default).
    wetDeltaSec: s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC,
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
  };
}
