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

import type {
  LapExclusion,
  RaceLogLap,
  RaceLogStintRow,
  TeamDriverStat,
} from "@/lib/stint-plan-state";

export type CleanLapStats = {
  avg: number | null;
  laps: number;
  dropped: number;
  /** How many laps each reason accounted for (only when the trace is marked). */
  byReason: Partial<Record<LapExclusion, number>>;
  /** Laps whose time was shifted to the reference temperature. */
  corrected: number;
  /** Racing laps left out because they carry no measured temperature. */
  uncorrectable: number;
};

/**
 * Shift lap times to a common track temperature.
 *
 * A long race cools: an evening enduro can shed 15 °C between the green flag
 * and the finish, and at a tenth of a second per degree that is a second and
 * a half of lap time that has nothing to do with the driver. Correcting for
 * it lets the man who drove the hot opening stint be compared with the man
 * who had the cool night.
 *
 * `slopePerC` must be a MEASURED figure (the plan's Garage 61 temperature
 * fit). The planner's 0.1 s/°C default is a placeholder, and a correction
 * built on a placeholder is a guess wearing a measurement's clothes — the
 * caller is expected to pass null rather than a default.
 */
export type TempCorrection = {
  /** Seconds of lap time per °C — measured, never a default. */
  slopePerC: number;
  /** The temperature every lap is corrected TO. */
  baseC: number;
  /** Where a lap's own temperature comes from. Defaults to the measured
   *  sample the logger wrote onto the lap; the dashboard passes a resolver
   *  that falls back to the temperature the pit wall typed for that stint,
   *  so a log from before the logger sampled weather is still usable. */
  tempOf?: (lap: RaceLogLap) => number | null;
};

/**
 * The average lap over a driver's RACING laps.
 *
 * Johann Solowej's method, and the reason for it: iRacing's average lap is the
 * driver's total time divided by their laps, so the pit stop at the end of a
 * stint sits inside it. A driver who runs two stints back-to-back carries two
 * stops in one average and reads slower than someone who ran one, and a repair
 * stop wrecks the figure outright.
 *
 * Since parser generation 2 the decision is made once, in the parser, and each
 * lap carries WHY it is out (`RaceLogLap.x`): formation lap, the lap with the
 * start on it, in-lap, out-lap, a lap under a full-course yellow, and the
 * restart lap after one. Pass `marked` when the trace came from that parser
 * (PlannerRaceLog.exclV >= 2).
 *
 * `marked: false` is the fallback for a log parsed before that: the only thing
 * reconstructible from the stored trace is the in/out pair, so that is all it
 * drops. Such a plan can be brought up to date with "Re-analyse" — the raw
 * .jsonl is still in the archive.
 *
 * `mine` holds indices into `all`, so the out-lap is recognised on the CAR's
 * lap sequence — including across a driver change, where the out-lap belongs to
 * the man taking over.
 */
export function cleanLapStats(
  all: RaceLogLap[],
  mine: number[],
  marked = false,
  temp?: TempCorrection | null
): CleanLapStats {
  const kept: number[] = [];
  const byReason: Partial<Record<LapExclusion, number>> = {};
  let dropped = 0;
  let corrected = 0;
  let uncorrectable = 0;
  for (const li of mine) {
    const l = all[li];
    if (!l) continue;

    let reason: LapExclusion | null = null;
    if (marked) {
      reason = l.x ?? null;
    } else {
      const prev = li > 0 ? all[li - 1] : null;
      if (l.pit === true) reason = "in";
      else if (prev?.pit === true && prev.lap === l.lap - 1) reason = "out";
    }

    if (reason) {
      dropped += 1;
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      continue;
    }

    if (temp) {
      // Correct the lap back to the reference temperature. A lap with no
      // measured temperature is LEFT OUT rather than corrected by zero:
      // silently mixing corrected and uncorrected laps into one average is
      // how you end up with a number that is neither.
      const tc = temp.tempOf ? temp.tempOf(l) : (l.tc ?? null);
      if (tc == null) {
        uncorrectable += 1;
        continue;
      }
      kept.push(l.sec - temp.slopePerC * (tc - temp.baseC));
      corrected += 1;
      continue;
    }
    kept.push(l.sec);
  }
  return {
    avg: kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null,
    laps: kept.length,
    dropped,
    byReason,
    corrected,
    uncorrectable,
  };
}

/** "2 formation/start, 6 in/out, 3 under yellow, 1 restart" — for the note
 *  under the average chart, so a wrong exclusion is visible instead of silent. */
export function describeExclusions(
  byReason: Partial<Record<LapExclusion, number>>
): string {
  const startish = (byReason.form ?? 0) + (byReason.start ?? 0);
  const inout = (byReason.in ?? 0) + (byReason.out ?? 0);
  const parts: string[] = [];
  if (startish) parts.push(`${startish} formation/start`);
  if (inout) parts.push(`${inout} in/out`);
  if (byReason.fcy) parts.push(`${byReason.fcy} under a full-course yellow`);
  if (byReason.restart) parts.push(`${byReason.restart} restart`);
  return parts.join(", ");
}

/** One stint of the PLAN: its race-clock window and who was supposed to drive
 *  it. `startSec`/`endSec` are seconds from the race start, as the planner
 *  computes them — including the live ± corrections typed during the race. */
export interface PlanStintWindow {
  startSec: number;
  endSec: number;
  driverName: string | null;
  /** Track temperature the pit wall entered for this stint, when it did.
   *  The fallback source for a log that predates weather sampling. */
  trackTempC?: number | null;
}

/**
 * Attribute the log's real stints using the plan's own driver order.
 *
 * This beats every inference: the plan says who drove when, and the live ±
 * corrections keep its windows aligned with what actually happened. Each real
 * stint (cut by the log's pit events) is given to the plan driver whose window
 * overlaps it most in time, so a minute of drift at the green flag or a stop
 * one lap early can't flip the assignment.
 *
 * @param stints     real stints from the log (need startSec/endSec)
 * @param plan       the plan's stint windows, in race order
 * @param driverName name → row index for the dashboard
 */
export function attributeByPlan(
  stints: RaceLogStintRow[],
  plan: PlanStintWindow[],
  rowIndexOf: (name: string) => number
): StintAttribution | null {
  const usable = plan.filter(
    (p) => p.driverName && p.endSec > p.startSec
  ) as (PlanStintWindow & { driverName: string })[];
  if (usable.length === 0) return null;
  if (!stints.some((s) => s.startSec != null && s.endSec != null)) return null;

  // Both clocks start at the race session: the logger's `t_session` and the
  // planner's race clock. Verified against the 6h Road America pair — matching
  // them directly reproduces iRacing's per-driver lap counts (41 vs 42, 39 vs
  // 40), while "helpfully" anchoring on the first completed lap shifted every
  // window by the formation laps and pushed a whole stint to the wrong driver.
  const byStint = stints.map((s) => {
    if (s.startSec == null || s.endSec == null) return -1;
    let bestRow = -1;
    let bestOverlap = 0;
    for (const p of usable) {
      const overlap = Math.min(s.endSec, p.endSec) - Math.max(s.startSec, p.startSec);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestRow = rowIndexOf(p.driverName);
      }
    }
    // A one-lap stint has zero duration and never overlaps anything: give it
    // to whichever planned stint its single timestamp falls in.
    if (bestRow < 0) {
      const p = usable.find(
        (w) => s.startSec! >= w.startSec && s.startSec! <= w.endSec
      );
      if (p) bestRow = rowIndexOf(p.driverName);
    }
    return bestRow;
  });

  const rowCount = Math.max(0, ...byStint) + 1;
  const lapsByDriver = new Array<number>(rowCount).fill(0);
  stints.forEach((st, i) => {
    if (byStint[i] >= 0) lapsByDriver[byStint[i]] += st.laps;
  });
  return {
    byStint,
    lapsByDriver,
    confident: byStint.every((d) => d >= 0),
    mergedStints: 0,
  };
}

/**
 * Does the plan's driver order actually match what iRacing scored?
 *
 * The plan is an INTENTION typed before the race. When driver B steps into the
 * car for driver A's last stint, the plan still says A — and the debrief then
 * paints a whole stint in the wrong colour and credits the wrong man. iRacing
 * scored the truth: every driver's completed laps are in the results file, and
 * a swapped stint moves a stint's worth of laps between two of them.
 *
 * So compare the two. `worstDelta` is the largest gap between the laps the
 * plan attribution hands a driver and the laps iRacing actually gave him;
 * anything past LAP_TOLERANCE means the plan is describing a race that did not
 * happen.
 */
export function planMatchesResults(
  att: StintAttribution,
  team: TeamDriverStat[],
  rowIndexOf: (name: string) => number
): { ok: boolean; worstDelta: number; worstDriver: string | null } {
  let worstDelta = 0;
  let worstDriver: string | null = null;
  let compared = 0;
  for (const d of team) {
    const i = rowIndexOf(d.name);
    if (i < 0) continue;
    // A driver the attribution never placed has 0 laps there; that is exactly
    // the case worth catching, so it is compared like any other.
    const got = att.lapsByDriver[i] ?? 0;
    const delta = Math.abs(got - d.laps);
    compared += 1;
    if (delta > worstDelta) {
      worstDelta = delta;
      worstDriver = d.name;
    }
  }
  // Nothing to compare against: say nothing rather than crying wolf.
  if (compared === 0) return { ok: true, worstDelta: 0, worstDriver: null };
  return { ok: worstDelta <= LAP_TOLERANCE, worstDelta, worstDriver };
}

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
