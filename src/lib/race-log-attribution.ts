/**
 * Who drove which stint?
 *
 * The iRacing race logger writes ONE driver name per car for the whole race —
 * it never sees a team's driver swaps (verified on the 6h Road America log:
 * car #200 has three drivers in the event result and a single name in 7,848 lap
 * events). So the log alone can never split a team's performance.
 *
 * The event result can: it gives every driver's lap count, and `best_lap_num`
 * pins each driver to one concrete lap of the race. Combined with the stint
 * boundaries from the log's pit events, that is enough to reconstruct who sat
 * in the car for each stint:
 *
 *   • every driver's best lap ANCHORS them to the stint containing that lap
 *   • the remaining stints are assigned so each driver's total lap count lands
 *     as close as possible to what iRacing scored, preferring as few swaps as
 *     possible (drivers don't hop in and out between consecutive stints)
 *
 * The result is an inference, not a fact from the file — the UI labels it as
 * such, and `confident` says whether every driver's reconstructed lap count
 * landed within tolerance.
 *
 * Pure module: no DB, no "use server", no React.
 */

import type { RaceLogStintRow, TeamDriverStat } from "@/lib/stint-plan-state";

export interface StintAttribution {
  /** driverIndex per stint (index into the drivers array), −1 = unknown. */
  byStint: number[];
  /** Reconstructed lap count per driver, same order as `drivers`. */
  lapsByDriver: number[];
  /** True when every driver's reconstructed laps are within tolerance. */
  confident: boolean;
  /** Stints too short to matter that were merged away, for the caption. */
  mergedStints: number;
}

/** Stints shorter than this are pit-lane noise (double entries, repairs). */
const MIN_STINT_LAPS = 3;
/** Reconstructed lap counts may miss this many laps per driver. */
const LAP_TOLERANCE = 6;
/** Cost per driver change between consecutive stints — keeps swaps plausible. */
const SWAP_PENALTY = 4;
/** Give up on the exhaustive search past this many combinations. */
const MAX_COMBOS = 400_000;

/**
 * @param stints  stint rows from the race log, in race order
 * @param drivers our drivers from the event result (laps + bestLapNum)
 */
export function attributeStints(
  stints: RaceLogStintRow[],
  drivers: TeamDriverStat[]
): StintAttribution | null {
  if (stints.length === 0 || drivers.length === 0) return null;
  if (drivers.length === 1) {
    return {
      byStint: stints.map(() => 0),
      lapsByDriver: [stints.reduce((s, st) => s + st.laps, 0)],
      confident: true,
      mergedStints: 0,
    };
  }

  // --- merge pit-lane noise so the search space stays small ---------------
  // A "stint" of one or two laps is a second pit entry (repairs, a splash),
  // not a driver change. Merge it into the previous real stint.
  type Merged = { laps: number; from: number; to: number; members: number[] };
  const merged: Merged[] = [];
  for (let i = 0; i < stints.length; i++) {
    const st = stints[i];
    const prev = merged[merged.length - 1];
    if (prev && st.laps < MIN_STINT_LAPS) {
      prev.laps += st.laps;
      prev.to = st.endLap ?? prev.to;
      prev.members.push(i);
    } else {
      merged.push({
        laps: st.laps,
        from: st.startLap ?? 0,
        to: st.endLap ?? 0,
        members: [i],
      });
    }
  }
  const mergedStints = stints.length - merged.length;

  // --- anchors: the stint that contains each driver's best lap ------------
  const anchor: (number | null)[] = merged.map(() => null);
  drivers.forEach((d, di) => {
    if (d.bestLapNum == null) return;
    const idx = merged.findIndex(
      (m) => d.bestLapNum! >= m.from && d.bestLapNum! <= m.to
    );
    // First anchor wins: two drivers claiming the same stint means the data
    // disagrees, and overwriting would silently pick the later one.
    if (idx >= 0 && anchor[idx] == null) anchor[idx] = di;
  });

  const n = merged.length;
  const k = drivers.length;
  const free = anchor.filter((a) => a == null).length;
  if (Math.pow(k, free) > MAX_COMBOS) {
    return greedy(merged, anchor, drivers, stints, mergedStints);
  }

  // --- exhaustive search over the unanchored stints -----------------------
  const assign = new Array<number>(n).fill(-1);
  let bestAssign: number[] | null = null;
  let bestCost = Infinity;

  const cost = (a: number[]): number => {
    const laps = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) laps[a[i]] += merged[i].laps;
    let c = 0;
    for (let d = 0; d < k; d++) {
      const diff = laps[d] - drivers[d].laps;
      c += diff * diff;
    }
    for (let i = 1; i < n; i++) if (a[i] !== a[i - 1]) c += SWAP_PENALTY;
    return c;
  };

  const walk = (i: number) => {
    if (i === n) {
      const c = cost(assign);
      if (c < bestCost) {
        bestCost = c;
        bestAssign = assign.slice();
      }
      return;
    }
    const fixed = anchor[i];
    if (fixed != null) {
      assign[i] = fixed;
      walk(i + 1);
      return;
    }
    for (let d = 0; d < k; d++) {
      assign[i] = d;
      walk(i + 1);
    }
  };
  walk(0);
  if (!bestAssign) return null;

  return expand(bestAssign, merged, drivers, stints, mergedStints);
}

/** Anchor-first fallback for logs with too many stints to search. */
function greedy(
  merged: { laps: number; from: number; to: number; members: number[] }[],
  anchor: (number | null)[],
  drivers: TeamDriverStat[],
  stints: RaceLogStintRow[],
  mergedStints: number
): StintAttribution {
  const a = anchor.slice();
  // Forward fill from the last known driver, then backward fill the head.
  let last: number | null = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] != null) last = a[i];
    else if (last != null) a[i] = last;
  }
  let next: number | null = null;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] != null) next = a[i];
    else if (next != null) a[i] = next;
  }
  const filled = a.map((x) => x ?? 0);
  return expand(filled, merged, drivers, stints, mergedStints);
}

function expand(
  assignMerged: number[],
  merged: { laps: number; from: number; to: number; members: number[] }[],
  drivers: TeamDriverStat[],
  stints: RaceLogStintRow[],
  mergedStints: number
): StintAttribution {
  const byStint = new Array<number>(stints.length).fill(-1);
  merged.forEach((m, i) => {
    for (const member of m.members) byStint[member] = assignMerged[i];
  });
  const lapsByDriver = new Array<number>(drivers.length).fill(0);
  stints.forEach((st, i) => {
    const d = byStint[i];
    if (d >= 0) lapsByDriver[d] += st.laps;
  });
  const confident = drivers.every(
    (d, i) => Math.abs(lapsByDriver[i] - d.laps) <= LAP_TOLERANCE
  );
  return { byStint, lapsByDriver, confident, mergedStints };
}
