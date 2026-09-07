/**
 * The race as it actually ran: every lap, every stint, and the plan beside it.
 *
 * Three views the de-briefing needs and the metric table cannot give:
 *   • the lap trace — where in the race time was lost, not just how much
 *   • stint by stint — who had which stint, how it compared with the plan
 *   • the timeline — the stint plan against what the team really did
 *
 * Pure module: no React, no DB, no "use server". One computation, read by both
 * the page and the .pptx, so the two can never disagree.
 */

import type {
  LapExclusion,
  PlannerRaceLog,
  RaceLogLap,
} from "@/lib/stint-plan-state";
import type { ScheduleStint } from "@/lib/stint-planner";
import { normName, type RaceLogModel } from "@/lib/race-log-model";

/** One lap of our car, ready to plot. */
export type DebriefLap = {
  lap: number;
  sec: number;
  /** Driver row index, -1 when the lap could not be attributed. */
  d: number;
  /** Session clock at the end of the lap, when the log carries one. */
  t: number | null;
  /** Why the lap is out of the averages — absent for a proper racing lap. */
  x: LapExclusion | null;
  /** The lap ended in the pits. */
  pit: boolean;
};

export type DebriefStint = {
  index: number;
  driver: string | null;
  /** Driver row index, for the colour. */
  d: number;
  startLap: number | null;
  endLap: number | null;
  laps: number;
  /** Mean over the stint's RACING laps — in/out and yellows removed. */
  avgSec: number | null;
  bestSec: number | null;
  /** Duration of the stop that ENDED this stint, in seconds. */
  pitSec: number | null;
  /** What the plan expected this driver's lap to be in this window. */
  planSec: number | null;
  /** Actual minus planned, in seconds per lap. Positive = slower than planned. */
  deltaSec: number | null;
  /** Incidents inside the stint's window — null when the log never recorded
   *  any with a timestamp, which is NOT the same as zero. */
  incidents: number | null;
  startSec: number | null;
  endSec: number | null;
};

/** One bar on the timeline. */
export type TimelineBar = {
  index: number;
  driver: string | null;
  d: number;
  startSec: number;
  endSec: number;
  /** The stop that ends this bar, in seconds (0 = none). */
  pitSec: number;
  laps: number | null;
};

export type DebriefTimeline = {
  /** Race clock covered by both rows, in seconds. */
  spanSec: number;
  planned: TimelineBar[];
  actual: TimelineBar[];
};

export type DebriefRaceDetail = {
  laps: DebriefLap[];
  stints: DebriefStint[];
  timeline: DebriefTimeline | null;
  /** True when the log carries timestamped incidents at all. */
  incidentsTimed: boolean;
  /** Fastest lap of our car, for the trace's reference line. */
  teamBestSec: number | null;
  /** Fastest lap in our class, when the log identified one. */
  classBestSec: number | null;
};

const round3 = (n: number | null): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000;

/** Mean of a stint's racing laps — the same exclusion rules as everywhere. */
function stintAverage(laps: RaceLogLap[], marked: boolean): number | null {
  const kept: number[] = [];
  for (let i = 0; i < laps.length; i++) {
    const l = laps[i];
    if (marked) {
      if (l.x) continue;
    } else {
      const prev = i > 0 ? laps[i - 1] : null;
      if (l.pit === true) continue;
      if (prev?.pit === true && prev.lap === l.lap - 1) continue;
    }
    if (Number.isFinite(l.sec) && l.sec > 0) kept.push(l.sec);
  }
  return kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null;
}

export function buildDebriefRace(
  log: PlannerRaceLog,
  model: RaceLogModel,
  schedule: ScheduleStint[]
): DebriefRaceDetail {
  const rawLaps = log.laps ?? [];
  const rawStints = log.stints ?? [];
  const marked = (log.exclV ?? 1) >= 2;

  const laps: DebriefLap[] = rawLaps.map((l, i) => ({
    lap: l.lap,
    sec: l.sec,
    d: model.lapRow[i] ?? -1,
    t: l.t ?? null,
    x: l.x ?? null,
    pit: l.pit === true,
  }));

  // Timestamped incidents, when the logger recorded any. An empty array on a
  // log that HAS the field still means "none recorded" — the difference from
  // "not measured" is carried by incidentsTimed.
  const incidents = log.incidents ?? [];
  const incidentsTimed = incidents.length > 0;

  // What the plan expected, per driver: the lap-weighted mean of the lap times
  // that driver's planned stints were computed with.
  const planByDriver = new Map<string, { laps: number; sec: number }>();
  for (const st of schedule) {
    if (!st.driverName || !Number.isFinite(st.lapSec) || st.lapSec <= 0) continue;
    const n = Number.isFinite(st.laps) && st.laps > 0 ? st.laps : 0;
    if (n === 0) continue;
    const k = normName(st.driverName);
    const cur = planByDriver.get(k) ?? { laps: 0, sec: 0 };
    cur.laps += n;
    cur.sec += n * st.lapSec;
    planByDriver.set(k, cur);
  }

  const stints: DebriefStint[] = rawStints.map((st, i) => {
    const d = model.stintRow[i] ?? st.d ?? -1;
    const driver = model.rows[d]?.name ?? st.drivers[0] ?? null;
    const mine = rawLaps.filter(
      (l) =>
        st.startLap != null &&
        st.endLap != null &&
        l.lap >= st.startLap &&
        l.lap <= st.endLap
    );
    const secs = mine.map((l) => l.sec).filter((s) => Number.isFinite(s) && s > 0);
    const avg = stintAverage(mine, marked);
    const plan = driver ? (planByDriver.get(normName(driver)) ?? null) : null;
    const planSec = plan && plan.laps > 0 ? plan.sec / plan.laps : null;
    const inWindow =
      incidentsTimed && st.startSec != null && st.endSec != null
        ? incidents.filter((e) => e.t >= st.startSec! && e.t <= st.endSec!).length
        : null;
    return {
      index: st.index,
      driver,
      d,
      startLap: st.startLap,
      endLap: st.endLap,
      laps: st.laps,
      avgSec: round3(avg),
      bestSec: secs.length ? round3(Math.min(...secs)) : null,
      pitSec: st.pitSec,
      planSec: round3(planSec),
      deltaSec: avg != null && planSec != null ? round3(avg - planSec) : null,
      incidents: inWindow,
      startSec: st.startSec ?? null,
      endSec: st.endSec ?? null,
    };
  });

  // ---- the timeline ------------------------------------------------------
  // Only worth drawing when both rows have a clock. A log without session
  // times cannot be laid against a plan, and half a comparison is worse than
  // none: it invites a conclusion the data does not support.
  // `>=`, not `>`: a stop that splits a stint leaves a one-lap stint whose
  // start and end land on the same second, and dropping those would silently
  // hide exactly the events the timeline exists to show. The renderers give
  // every bar a minimum width.
  //
  // Map BEFORE filtering: `model.stintRow` is indexed by the stint's position
  // in the log, and reading it with the index of a filtered array attributes
  // the bars to the wrong drivers.
  const actualBars: TimelineBar[] = rawStints
    .map((st, i) => ({
      index: st.index,
      driver: model.rows[model.stintRow[i] ?? -1]?.name ?? null,
      d: model.stintRow[i] ?? st.d ?? -1,
      startSec: st.startSec,
      endSec: st.endSec,
      pitSec: st.pitSec ?? 0,
      laps: st.laps,
    }))
    .flatMap<TimelineBar>((b) =>
      b.startSec != null && b.endSec != null && b.endSec >= b.startSec
        ? [{ ...b, startSec: b.startSec, endSec: b.endSec }]
        : []
    );

  // The plan's own driver order decides the colour, matched to the same rows
  // the rest of the de-briefing colours by.
  const rowIndexOf = (name: string | null) =>
    name == null
      ? -1
      : model.rows.findIndex((r) => normName(r.name) === normName(name));
  const plannedBars: TimelineBar[] = schedule
    .filter((st) => st.endSec > st.startSec)
    .map((st) => ({
      index: st.index,
      driver: st.driverName,
      d: rowIndexOf(st.driverName),
      startSec: st.startSec,
      endSec: st.endSec,
      pitSec: st.stopSec ?? 0,
      laps: st.laps,
    }));

  const ends = [
    ...actualBars.map((b) => b.endSec + b.pitSec),
    ...plannedBars.map((b) => b.endSec + b.pitSec),
  ];
  const timeline =
    actualBars.length > 0 || plannedBars.length > 0
      ? {
          spanSec: ends.length ? Math.max(...ends) : 0,
          planned: plannedBars,
          actual: actualBars,
        }
      : null;

  const allSecs = rawLaps.map((l) => l.sec).filter((s) => Number.isFinite(s) && s > 0);

  return {
    laps,
    stints,
    timeline,
    incidentsTimed,
    teamBestSec: allSecs.length ? round3(Math.min(...allSecs)) : null,
    classBestSec: log.classBestSec ?? null,
  };
}
