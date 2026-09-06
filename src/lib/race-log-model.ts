/**
 * Who drove which stint, and how each of our drivers performed.
 *
 * This is the model behind the race-log dashboard, lifted out of the component
 * so that the dashboard, the debriefing page and the .pptx export all read the
 * SAME numbers. A metric that is computed twice is a metric that will one day
 * disagree with itself in front of the team.
 *
 * Pure module: no React, no DB, no "use server".
 */

import type {
  LapExclusion,
  PlannerRaceLog,
  RaceLogDriverRow,
  RaceLogLap,
  RaceLogStintRow,
  TeamDriverStat,
} from "@/lib/stint-plan-state";
import {
  attributeByPlan,
  attributeStints,
  cleanLapStats,
  planMatchesResults,
  type TempCorrection,
  type PlanStintWindow,
} from "@/lib/race-log-attribution";

export const normName = (s: string) => s.trim().toLowerCase();

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

/** Population standard deviation, or null for fewer than two samples. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  return Math.sqrt(v);
}

/** One driver row: hard numbers from iRacing plus the reconstructed ones. */
export type RaceLogRow = {
  name: string;
  slot: number;
  /** From the event result in team events, from the log in solo races. */
  laps: number | null;
  bestSec: number | null;
  avgSec: number | null;
  incidents: number | null;
  /** Derived from the log (reconstructed stints in team events). */
  greenSec: number | null;
  spreadSec: number | null;
  stints: number;
  /** Mean lap over this driver's RACING laps: pit in-laps and the out-laps
   *  after them removed. iRacing's own average counts them, which is why a
   *  double-stinter or anyone who sat in the box for repairs looks slower than
   *  they drove. */
  cleanSec: number | null;
  cleanLaps: number;
  cleanDropped: number;
  cleanByReason: Partial<Record<LapExclusion, number>>;
  /** The rating this driver started the race with, from the results file. */
  iRating: number | null;
  /** Mean racing lap shifted to the plan's reference temperature. */
  tempSec: number | null;
  tempLaps: number;
  tempSkipped: number;
  /** Spread of this driver's clean laps, in seconds — the basis of the
   *  consistency figure. Null when fewer than two clean laps exist. */
  cleanStdSec: number | null;
  /** Seconds the driver was on track, from the stints attributed to them.
   *  Null when the log carries no session clock. */
  driveSec: number | null;
};

export type RaceLogModel = {
  rows: RaceLogRow[];
  /** lap index → row index (-1 = unattributed). */
  lapRow: number[];
  /** stint index → row index. */
  stintRow: number[];
  source: "plan" | "inferred" | "log";
  confident: boolean;
  planCheck: ReturnType<typeof planMatchesResults> | null;
  planDisagrees: boolean;
  overridden: number;
  autoStintRow: number[];
};

export type RaceLogModelInput = {
  laps: RaceLogLap[];
  logDrivers: RaceLogDriverRow[];
  stints: RaceLogStintRow[];
  teamDrivers?: TeamDriverStat[];
  planStints?: PlanStintWindow[];
  /** Did the parser mark WHY each lap is out? (PlannerRaceLog.exclV >= 2) */
  marked: boolean;
  tempCorrection?: TempCorrection | null;
  /** Hand corrections: stint index → driver name. */
  overrides?: (string | null)[];
};

/** Seconds a set of stints was on track, or null when the log has no clock. */
function driveSecOf(stints: RaceLogStintRow[], mine: number[]): number | null {
  let total = 0;
  let any = false;
  for (const si of mine) {
    const st = stints[si];
    if (!st || st.startSec == null || st.endSec == null) continue;
    if (st.endSec <= st.startSec) continue;
    total += st.endSec - st.startSec;
    any = true;
  }
  return any ? total : null;
}

export function buildRaceLogModel({
  laps,
  logDrivers,
  stints,
  teamDrivers,
  planStints,
  marked,
  tempCorrection = null,
  overrides = [],
}: RaceLogModelInput): RaceLogModel {
  const team = teamDrivers ?? [];
  const plan = planStints ?? [];
  const planNames: string[] = [];
  for (const p of plan) {
    if (
      p.driverName &&
      !planNames.some((n) => normName(n) === normName(p.driverName!))
    )
      planNames.push(p.driverName);
  }

  // Who we have a row for: the event result's line-up (it carries iRacing's
  // own numbers), plus anyone the plan lists who isn't in it.
  const names: { name: string; stat?: TeamDriverStat }[] = team.map((d) => ({
    name: d.name,
    stat: d,
  }));
  for (const n of planNames) {
    if (!names.some((r) => normName(r.name) === normName(n)))
      names.push({ name: n });
  }
  const rowIndexOf = (name: string) =>
    names.findIndex((r) => normName(r.name) === normName(name));

  // --- solo race with neither a plan line-up nor an event result ----------
  if (names.length === 0) {
    return {
      rows: logDrivers.map<RaceLogRow>((d, di) => {
        const soloIdx = laps
          .map((_, li) => li)
          .filter((li) => laps[li].d === di);
        const clean = cleanLapStats(laps, soloIdx, marked);
        const temp = tempCorrection
          ? cleanLapStats(laps, soloIdx, marked, tempCorrection)
          : null;
        const cleanSecs = cleanLapSeconds(laps, soloIdx, marked);
        return {
          name: d.driver,
          slot: d.slot,
          laps: d.laps,
          bestSec: d.bestSec,
          avgSec: d.avgSec,
          incidents: d.incidents,
          greenSec: d.greenSec,
          spreadSec: d.spreadSec,
          stints: d.stints,
          iRating: null,
          cleanSec: clean.avg,
          cleanLaps: clean.laps,
          cleanDropped: clean.dropped,
          cleanByReason: clean.byReason,
          tempSec: temp?.avg ?? null,
          tempLaps: temp?.corrected ?? 0,
          tempSkipped: temp?.uncorrectable ?? 0,
          cleanStdSec: stdev(cleanSecs),
          driveSec: null,
        };
      }),
      lapRow: laps.map((l) => l.d),
      stintRow: stints.map((s) => s.d),
      source: "log",
      confident: true,
      planCheck: null,
      planDisagrees: false,
      overridden: 0,
      autoStintRow: stints.map((st) => st.d),
    };
  }

  // --- who drove which stint ---------------------------------------------
  //   1. a hand correction someone typed into the stint table — a human who
  //      was there beats every automatic source and is never overruled;
  //   2. the log itself, when it names more than one driver for our car;
  //   3. the plan's driver order — but only if it squares with the laps
  //      iRacing scored;
  //   4. the reconstruction from the results' fastest-lap anchors.
  const logSplitsDrivers = logDrivers.length > 1;
  const planAtt = attributeByPlan(stints, plan, rowIndexOf);
  const planCheck =
    planAtt && team.length > 0
      ? planMatchesResults(planAtt, team, rowIndexOf)
      : null;
  const planDisagrees = planCheck != null && !planCheck.ok;
  const inferredAtt = attributeStints(stints, team);
  const att = planDisagrees ? (inferredAtt ?? planAtt) : (planAtt ?? inferredAtt);

  const logStintRowRaw = logSplitsDrivers
    ? stints.map((st) => {
        const own = logDrivers[st.d]?.driver ?? st.drivers[0] ?? "";
        return rowIndexOf(own);
      })
    : null;
  const logStintRow =
    logStintRowRaw && logStintRowRaw.every((r) => r >= 0) ? logStintRowRaw : null;

  const baseStintRow =
    logStintRow ?? (att ? att.byStint : stints.map(() => -1));

  const stintRow = baseStintRow.map((r, i) => {
    const forced = overrides[i];
    if (!forced) return r;
    const idx = rowIndexOf(forced);
    return idx >= 0 ? idx : r;
  });
  const overridden = baseStintRow.filter((r, i) => {
    const forced = overrides[i];
    return !!forced && rowIndexOf(forced) >= 0 && rowIndexOf(forced) !== r;
  }).length;

  const source: "plan" | "inferred" | "log" = logStintRow
    ? "log"
    : planDisagrees
      ? inferredAtt
        ? "inferred"
        : "plan"
      : planAtt
        ? "plan"
        : att
          ? "inferred"
          : "log";

  const lapRow = laps.map((l) => {
    const si = stints.findIndex((s) => s.endLap != null && l.lap <= s.endLap);
    return si >= 0 ? stintRow[si] : (stintRow[stintRow.length - 1] ?? -1);
  });

  const rows = names.map<RaceLogRow>(({ name, stat }, i) => {
    const mineIdx = laps.map((_, li) => li).filter((li) => lapRow[li] === i);
    const mine = mineIdx.map((li) => laps[li].sec);
    const best = mine.length ? Math.min(...mine) : null;
    const green = best ? mine.filter((s) => s <= best * 1.05) : [];
    const p90 = percentile(green, 0.9);
    const clean = cleanLapStats(laps, mineIdx, marked);
    const temp = tempCorrection
      ? cleanLapStats(laps, mineIdx, marked, tempCorrection)
      : null;
    const myStints = stintRow
      .map((r, si) => (r === i ? si : -1))
      .filter((si) => si >= 0);
    return {
      cleanSec: clean.avg,
      cleanLaps: clean.laps,
      cleanDropped: clean.dropped,
      cleanByReason: clean.byReason,
      tempSec: temp?.avg ?? null,
      tempLaps: temp?.corrected ?? 0,
      tempSkipped: temp?.uncorrectable ?? 0,
      name,
      slot: i,
      laps: stat?.laps ?? (mine.length || null),
      bestSec: stat?.bestSec ?? best,
      avgSec:
        stat?.avgSec ??
        (mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : null),
      incidents: stat?.incidents ?? null,
      iRating: stat?.iRating ?? null,
      greenSec: median(green),
      spreadSec: p90 != null && best != null ? p90 - best : null,
      stints: myStints.length,
      cleanStdSec: stdev(cleanLapSeconds(laps, mineIdx, marked)),
      driveSec: driveSecOf(stints, myStints),
    };
  });

  return {
    rows,
    lapRow,
    stintRow,
    source,
    confident: logStintRow ? true : (att?.confident ?? false),
    planCheck,
    planDisagrees,
    overridden,
    autoStintRow: baseStintRow,
  };
}

/**
 * The lap times that survive the exclusion rules, for a spread measurement.
 *
 * `cleanLapStats` returns the mean and the bookkeeping but not the sample, and
 * consistency needs the sample. The rule for what counts is the parser's, not
 * a second opinion: the same `x` marks, and the same in/out fallback for a
 * trace from before the parser marked laps.
 */
export function cleanLapSeconds(
  all: RaceLogLap[],
  mine: number[],
  marked: boolean
): number[] {
  const out: number[] = [];
  for (const li of mine) {
    const l = all[li];
    if (!l) continue;
    if (marked) {
      if (l.x) continue;
    } else {
      const prev = li > 0 ? all[li - 1] : null;
      if (l.pit === true) continue;
      if (prev?.pit === true && prev.lap === l.lap - 1) continue;
    }
    if (Number.isFinite(l.sec) && l.sec > 0) out.push(l.sec);
  }
  return out;
}

/** Convenience: build the model straight from a stored race log. */
export function modelFromLog(
  log: PlannerRaceLog,
  opts: Omit<RaceLogModelInput, "laps" | "logDrivers" | "stints" | "marked">
): RaceLogModel {
  return buildRaceLogModel({
    laps: log.laps ?? [],
    logDrivers: log.drivers ?? [],
    stints: log.stints ?? [],
    marked: (log.exclV ?? 1) >= 2,
    ...opts,
  });
}
