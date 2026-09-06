/**
 * The shared pace-curve library (iRating → lap time), read side.
 *
 * One row per car class + track + session type. A plan picks a curve once and
 * the debrief measures every driver against what his own iRating was worth
 * there. Pure read helpers — no "use server", so pages may import it.
 *
 * See src/lib/pace-reference.ts for the maths and where the numbers come from.
 */
import { prisma } from "@/lib/prisma";
import { parsePacePoints, type PacePoint } from "@/lib/pace-reference";

export type PaceSessionType = "RACE" | "QUALIFY" | "PRACTICE" | "TIME_TRIAL";

export type PaceReferenceRow = {
  id: string;
  label: string;
  carClass: string;
  track: string;
  sessionType: PaceSessionType;
  iracingSeasonId: number | null;
  iracingRaceWeek: number | null;
  iracingCarClassId: number | null;
  points: PacePoint[];
  source: string | null;
  notes: string | null;
  updatedAt: Date;
};

export async function getPaceReferences(): Promise<PaceReferenceRow[]> {
  const rows = await prisma.paceReference.findMany({
    orderBy: [{ carClass: "asc" }, { track: "asc" }, { sessionType: "asc" }],
    select: {
      id: true,
      label: true,
      carClass: true,
      track: true,
      sessionType: true,
      iracingSeasonId: true,
      iracingRaceWeek: true,
      iracingCarClassId: true,
      points: true,
      source: true,
      notes: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    sessionType: r.sessionType as PaceSessionType,
    // Stored as JSON; re-clean on the way out so one bad row cannot poison a
    // page that only wanted to list the library.
    points: parsePacePoints(r.points),
  }));
}

function key(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The curve a plan should offer first: same track, and a car class that looks
 * like the plan's car. RACE beats the other session types — a race debrief is
 * measured against race pace.
 */
export function suggestPaceReference(
  rows: PaceReferenceRow[],
  car: string,
  track: string
): PaceReferenceRow | null {
  const t = key(track);
  if (!t) return null;
  const sameTrack = rows.filter((r) => key(r.track) === t);
  if (sameTrack.length === 0) return null;
  const c = key(car);
  const carMatch = sameTrack.filter(
    (r) => c !== "" && (key(r.carClass).includes(c) || c.includes(key(r.carClass)))
  );
  const pool = carMatch.length > 0 ? carMatch : sameTrack;
  return pool.find((r) => r.sessionType === "RACE") ?? pool[0] ?? null;
}
