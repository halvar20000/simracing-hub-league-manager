/**
 * Shared pit-stop constants (the "pit reference library").
 *
 * One row per car, optionally per track. A stint plan loads a row with one
 * click instead of every team re-measuring and re-typing the same numbers.
 * Pure read helpers — no "use server", so pages and API routes may import it.
 */
import { prisma } from "@/lib/prisma";

export type PitReferenceRow = {
  id: string;
  car: string;
  track: string;
  tankSizeL: number | null;
  laneLossSec: number;
  refuelLps: number;
  tyreChangeSec: number;
  driverChangeSec: number;
  tyreSequential: boolean;
  tyreWearPctPerLap: number | null;
  source: string | null;
  notes: string | null;
};

export async function getPitReferences(): Promise<PitReferenceRow[]> {
  const rows = await prisma.pitReference.findMany({
    orderBy: [{ car: "asc" }, { track: "asc" }],
    select: {
      id: true,
      car: true,
      track: true,
      tankSizeL: true,
      laneLossSec: true,
      refuelLps: true,
      tyreChangeSec: true,
      driverChangeSec: true,
      tyreSequential: true,
      tyreWearPctPerLap: true,
      source: true,
      notes: true,
    },
  });
  return rows;
}

function key(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Best row for a car + track: the exact pair wins, otherwise the car's
 * track-less default (tank, refuel rate and tyre time hardly move between
 * tracks — only the lane loss does).
 */
export function matchPitReference(
  rows: PitReferenceRow[],
  car: string,
  track: string
): { exact: PitReferenceRow | null; carDefault: PitReferenceRow | null } {
  const c = key(car);
  const t = key(track);
  if (!c) return { exact: null, carDefault: null };
  const sameCar = rows.filter(
    (r) => key(r.car) === c || key(r.car).includes(c) || c.includes(key(r.car))
  );
  return {
    exact: sameCar.find((r) => r.track && key(r.track) === t) ?? null,
    carDefault: sameCar.find((r) => !r.track) ?? null,
  };
}
