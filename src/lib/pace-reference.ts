/**
 * Pace curves: what lap time an iRating is worth, and the target time a
 * particular driver should have set.
 *
 * WHY: against the class best, a 1200 iR driver in an official race always
 * looks bad and a 6000 iR driver always looks fine — the yardstick is the
 * fastest man on the grid, who has nothing to do with either of them. iRacing
 * publishes, per season / race week / car class / session type, a fitted curve
 * of fastest lap against driver iRating. Read a driver's own iRating off that
 * curve and you get the lap time he was expected to set; the gap to THAT is
 * performance rather than pedigree.
 *
 * WHERE THE NUMBERS COME FROM: the members site, by hand. The source file
 * lives in a private bucket reachable only through a one-hour pre-signed URL
 * that the logged-in site mints (an unsigned request answers 403 — verified),
 * so CLS does not and will not fetch it: an admin pastes the JSON into the
 * pace-reference library. docs/pace-reference.md has the one-click export.
 *
 * Pure module: no DB, no "use server", no React.
 */

/** One point of a fitted curve. */
export type PacePoint = { irating: number; lapSec: number };

/** iRacing's `event_type` in the Series Insights file. */
export const IRACING_EVENT_TYPE = {
  2: "PRACTICE",
  3: "QUALIFY",
  4: "TIME_TRIAL",
  5: "RACE",
} as const;

/** Accept and clean whatever came out of the paste box. */
export function parsePacePoints(raw: unknown): PacePoint[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { line?: unknown }).line)
      ? ((raw as { line: unknown[] }).line as unknown[])
      : [];
  const out: PacePoint[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    // The source calls them irating / lap_time; our own storage uses lapSec.
    const ir = o.irating ?? o.iRating ?? o.ir;
    const lt = o.lapSec ?? o.lap_time ?? o.lapTime ?? o.sec;
    if (typeof ir !== "number" || !Number.isFinite(ir) || ir <= 0) continue;
    if (typeof lt !== "number" || !Number.isFinite(lt) || lt <= 0) continue;
    out.push({ irating: Math.round(ir), lapSec: Math.round(lt * 1000) / 1000 });
  }
  // Sort and de-duplicate on iRating — a curve with two answers for the same
  // input is not a curve.
  out.sort((a, b) => a.irating - b.irating);
  return out.filter((p, i) => i === 0 || p.irating !== out[i - 1].irating);
}

/**
 * The lap time this curve expects of a given iRating.
 *
 * Linear interpolation between the two neighbouring points. OUTSIDE the
 * curve's range the value is CLAMPED to the nearest end rather than
 * extrapolated: the source's own fit flattens at the top (its last few points
 * are identical), and running a straight line off the end of it would invent
 * lap times nobody measured. A driver past either end is compared against the
 * end point, and `exact` says so.
 */
export function targetLapSec(
  points: PacePoint[],
  irating: number | null | undefined
): { sec: number; exact: boolean } | null {
  if (!points || points.length === 0) return null;
  if (typeof irating !== "number" || !Number.isFinite(irating) || irating <= 0) {
    return null;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (irating <= first.irating) {
    return { sec: first.lapSec, exact: irating === first.irating };
  }
  if (irating >= last.irating) {
    return { sec: last.lapSec, exact: irating === last.irating };
  }
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i];
    if (b.irating < irating) continue;
    const a = points[i - 1];
    if (b.irating === a.irating) return { sec: b.lapSec, exact: true };
    const f = (irating - a.irating) / (b.irating - a.irating);
    return { sec: a.lapSec + f * (b.lapSec - a.lapSec), exact: false };
  }
  return { sec: last.lapSec, exact: false };
}

/** The reference lap of a very strong driver — the "10k" yardstick. Reads the
 *  curve at `atIrating` (10000 by default), which is where its fit tops out. */
export function referenceLapSec(points: PacePoint[], atIrating = 10000): number | null {
  return targetLapSec(points, atIrating)?.sec ?? null;
}

/** "1:58.775" — a curve is read in lap times, not in seconds. */
export function fmtPaceSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

/** "1:58.775", "118.775" or "118,775" back into seconds. */
export function parseLapInput(raw: string): number | null {
  const t = (raw ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const sec = Number(m[1]) * 60 + Number(m[2]);
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A curve summarised for a picker: how many points and what it spans. */
export function describeCurve(points: PacePoint[]): string {
  if (points.length === 0) return "no points";
  const a = points[0];
  const b = points[points.length - 1];
  return `${points.length} points, iR ${a.irating}–${b.irating}, ${fmtPaceSec(
    b.lapSec
  )}–${fmtPaceSec(a.lapSec)}`;
}
