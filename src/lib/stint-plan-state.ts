// Serialized stint-planner state (what we persist as JSON) + conversion to the
// pure engine input. Kept out of the "use client" component so Server
// Components (the pages) can build the default state safely.

import {
  parseDurationToSec,
  type PlannerInput,
  type StintMode,
  type StintProfileKey,
} from "@/lib/stint-planner";

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
  name: string;
  carNumber: string | null;
  car: string | null;
  laps: number;
  incidents: number;
};

/** Archived + parsed end-of-session eventresult attached to a plan. */
export type PlannerEventResult = {
  url: string; // Vercel Blob URL of the raw eventresult.json
  name: string; // original file name
  summary: ResultRow[];
  parsedAt: string; // ISO timestamp
};
export type PlannerAssignmentState = {
  profile: StintProfileKey;
  driverId: string | null;
  correctionMin?: number; // live ± minutes for this stint (cascades forward)
  spotterId?: string | null; // driver spotting this stint (never the stint driver)
};
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
  };
  standard: { laptime: string; fuelPerLap: string };
  savingEnabled: boolean;
  saving: { laptime: string; fuelPerLap: string };
  drivers: PlannerDriverState[];
  assignments: PlannerAssignmentState[];
  /** Driver availability: driverId → race-hour indices (0-based) the driver is
   *  NOT available. Missing/empty = available all race (the default). */
  availability: Record<string, number[]>;
  /** Free-text team notes shown on the plan (saved with it). */
  notes: { pre: string; during: string; post: string };
  /** Archived + parsed end-of-session eventresult, or null. */
  eventResult: PlannerEventResult | null;
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
    },
    standard: { laptime: "1:55", fuelPerLap: "3.29" },
    savingEnabled: false,
    saving: { laptime: "1:56", fuelPerLap: "3.20" },
    drivers: [],
    assignments: [],
    availability: {},
    notes: { pre: "", during: "", post: "" },
    eventResult: null,
  };
}

/** Merge a stored payload (+title) over the current defaults into a full
 *  PlannerState. Used both by the server page and the live auto-refresh so a
 *  plan saved by an older build always opens cleanly. */
export function hydratePlanState(payload: unknown, title: string): PlannerState {
  const base = defaultPlannerState();
  const stored = (payload ?? {}) as Partial<PlannerState>;
  return {
    ...base,
    ...stored,
    title,
    event: { ...base.event, ...(stored.event ?? {}) },
    notes: { ...base.notes, ...(stored.notes ?? {}) },
    availability: stored.availability ?? base.availability,
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
    })),
  };
}
