// Serialized stint-planner state (what we persist as JSON) + conversion to the
// pure engine input. Kept out of the "use client" component so Server
// Components (the pages) can build the default state safely.

import {
  parseDurationToSec,
  type PlannerInput,
  type StintProfileKey,
} from "@/lib/stint-planner";

export type PlannerDriverState = {
  id: string;
  name: string;
  laptime: string; // "" = use standard profile pace
};
export type PlannerAssignmentState = {
  profile: StintProfileKey;
  driverId: string | null;
};
export type PlannerState = {
  title: string;
  event: {
    raceDuration: string; // "6:00:00"
    greenFlagOffset: string; // "0:30"
    pitLoss: string; // seconds, "70"
    tankSize: string; // litres, "75"
    sessionStartLocal: string; // datetime-local value, "" = none
  };
  standard: { laptime: string; fuelPerLap: string };
  savingEnabled: boolean;
  saving: { laptime: string; fuelPerLap: string };
  drivers: PlannerDriverState[];
  assignments: PlannerAssignmentState[];
};

let uidCounter = 0;
export const uid = () =>
  `d${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function defaultPlannerState(): PlannerState {
  return {
    title: "6h Road America",
    event: {
      raceDuration: "6:00:00",
      greenFlagOffset: "0:00",
      pitLoss: "70",
      tankSize: "75",
      sessionStartLocal: "",
    },
    standard: { laptime: "1:55", fuelPerLap: "3.29" },
    savingEnabled: false,
    saving: { laptime: "1:56", fuelPerLap: "3.20" },
    drivers: [],
    assignments: [],
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
    drivers: s.drivers.map((d) => ({
      id: d.id,
      name: d.name || "Driver",
      laptimeSec: d.laptime.trim() ? parseDurationToSec(d.laptime) : null,
    })),
    assignments: s.assignments.map((a) => ({
      profile: a.profile,
      driverId: a.driverId,
    })),
  };
}
