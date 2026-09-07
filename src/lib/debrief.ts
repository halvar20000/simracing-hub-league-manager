/**
 * The post-race debriefing: one dataset, three outputs.
 *
 * Johann Solowej builds a slide deck for the team after every endurance race —
 * awards, a table of per-driver metrics, the raw numbers behind them and a
 * trend over the season. This module computes exactly that from what the plan
 * already holds (the schedule, the race-logger trace and the event result), so
 * the CLS page, the .pptx export and the history table all read the same
 * figures. Nothing here reaches for the network or the database.
 *
 * WHAT EACH METRIC MEANS, and why it is that and not something else:
 *
 *   Ø gesamt        iRacing's own average: total time ÷ laps, pit stops
 *                   included. Kept because it is what the results page shows
 *                   and somebody always wants to reconcile the two.
 *   Ø clean         the same average over RACING laps only — formation, start,
 *                   in/out, full-course yellow and the restart lap removed.
 *                   This is the number that says how fast someone drove.
 *   Prognose        what the plan expected of this driver: the lap-weighted
 *                   mean of the lap times their planned stints were computed
 *                   with, so weather, temperature and the traffic penalty are
 *                   already in it.
 *   Relativperfor-  the lap this driver's OWN iRating was worth here, divided
 *   mance           by the lap they actually set. Above 100 % = quicker than
 *                   their rating. It never compares one driver with another,
 *                   which is the point: a team with a 1200 and a 3000 iR
 *                   driver must not be measured as if they were doing the same
 *                   job.
 *   10k-Performance the same ratio against the fixed ≈10k reference lap. Does
 *                   not move with the day's entry list, so it is the figure
 *                   that can be compared across races and across a season.
 *   Konstanz        1 − (Ø clean − beste Runde) ÷ beste Runde: how far the
 *                   average sat above the driver's own best lap, as a share of
 *                   that lap. Johann Solowej's definition, so CLS and his
 *                   spreadsheet agree — with one correction: his sheet divides
 *                   by 84600 where it means 86400 (transposed digits), which
 *                   inflates every value by about 2 %. Measured per driver
 *                   against their own laps, never driver against driver.
 *   Incs/h          incidents ÷ hours actually driven. Raw totals punish
 *                   whoever took the most stints, which is the opposite of
 *                   what a debrief should reward.
 *
 * Pure module: no React, no DB, no "use server".
 */

import type { PlannerRaceLog, TeamDriverStat } from "@/lib/stint-plan-state";
import type { ScheduleStint } from "@/lib/stint-planner";
import type { TempCorrection, PlanStintWindow } from "@/lib/race-log-attribution";
import { targetLapSec, type PacePoint } from "@/lib/pace-reference";
import {
  modelFromLog,
  normName,
  type RaceLogModel,
  type RaceLogRow,
} from "@/lib/race-log-model";

/** What a driver was measured against, so a gap is never shown unlabelled. */
export type DebriefBaseline = "irating" | "ref10k" | "classbest" | "teambest";

export type DebriefDriver = {
  name: string;
  /** Colour slot — the same one the dashboard gives this driver. */
  slot: number;
  iRating: number | null;
  laps: number | null;
  stints: number;
  /** Seconds on track, from the stints attributed to this driver. */
  driveSec: number | null;

  // --- lap times, all in seconds -----------------------------------------
  avgAllSec: number | null;
  avgCleanSec: number | null;
  /** Temperature-corrected clean average, when a MEASURED slope exists. */
  avgTempSec: number | null;
  /** What the plan expected of this driver. Null when they were not planned. */
  planSec: number | null;
  bestSec: number | null;
  /** The lap this driver's own iRating was worth here. */
  refIRatingSec: number | null;
  /** What the row is actually measured against, and which source that is. */
  baselineSec: number | null;
  baseline: DebriefBaseline;

  // --- deltas, in seconds (positive = slower) ----------------------------
  dAllVsClean: number | null;
  dAllVsPlan: number | null;
  dCleanVsBest: number | null;
  /** Own best lap against the reference: negative = faster than the yardstick,
   *  which is how Johann's sheet reads it. */
  dBestVsRef: number | null;

  // --- ratios, as fractions (1.00991 = 100.991 %) ------------------------
  relPerf: number | null;
  perf10k: number | null;
  consistency: number | null;

  // --- safety ------------------------------------------------------------
  incidents: number | null;
  incPerHour: number | null;
};

export type DebriefAward = {
  key:
    | "fastestLap"
    | "fastestAverage"
    | "consistency"
    | "relPerf"
    | "safest";
  label: string;
  /** Null when nothing in the field could be measured for this award. */
  winner: string | null;
  value: string;
};

export type DebriefData = {
  title: string;
  track: string | null;
  car: string | null;
  sessionName: string | null;
  /** League race or an iRacing official — it decides the yardstick. */
  official: boolean;
  /** The fastest lap in our class, when the log identified one. */
  classBestSec: number | null;
  /** The fixed ≈10k reference lap the plan carries, when it does. */
  ref10kSec: number | null;
  /** The fastest lap any of OUR drivers set. */
  teamBestSec: number | null;
  drivers: DebriefDriver[];
  awards: DebriefAward[];
  /** Were incidents ever actually measured? A standalone logger with no
   *  dashboard records zero whether the race was clean or a demolition
   *  derby — see RaceLogDashboard for the same guard. */
  incidentsMeasured: boolean;
  /** How the stint split was arrived at, so the page can say so. */
  attribution: "plan" | "inferred" | "log";
  /** Warnings worth printing under the table rather than hiding. */
  notes: string[];
};

export type DebriefInput = {
  title: string;
  car: string | null;
  log: PlannerRaceLog;
  teamDrivers?: TeamDriverStat[];
  /** The plan's own schedule — the source of the Prognose and of the stint
   *  windows used to attribute laps. */
  schedule?: ScheduleStint[];
  official: boolean;
  paceCurve?: PacePoint[] | null;
  ref10kSec?: number | null;
  tempCorrection?: TempCorrection | null;
  /** Hand corrections: stint index → driver name. */
  stintDriverOverrides?: (string | null)[];
  /** An already-computed model. Walking a twelve-hour trace is not free, and
   *  the caller usually needs the same model for the lap chart and the stint
   *  table — so it may build it once and hand it in. */
  model?: RaceLogModel;
};

/** 92.418 → "1:32,418" — German decimal comma, as the team reads it. */
export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0").replace(".", ",")}`;
}

/** 0.018 → "+0,018" (German decimal comma, as the team reads it). */
export function fmtDelta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = `${sec >= 0 ? "+" : "−"}${Math.abs(sec).toFixed(3)}`;
  return s.replace(".", ",");
}

/** 1.00991 → "100,991 %" */
export function fmtPct(x: number | null | undefined, digits = 3): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
}

/** The lap-weighted mean lap time the plan expected of each driver. */
export function prognosisByDriver(
  schedule: ScheduleStint[]
): Map<string, number> {
  const acc = new Map<string, { laps: number; sec: number }>();
  for (const st of schedule) {
    if (!st.driverName) continue;
    if (!Number.isFinite(st.lapSec) || st.lapSec <= 0) continue;
    const laps = Number.isFinite(st.laps) && st.laps > 0 ? st.laps : 0;
    if (laps === 0) continue;
    const key = normName(st.driverName);
    const cur = acc.get(key) ?? { laps: 0, sec: 0 };
    cur.laps += laps;
    cur.sec += laps * st.lapSec;
    acc.set(key, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of acc) if (v.laps > 0) out.set(k, v.sec / v.laps);
  return out;
}

/** The plan's stint windows, for attributing the log's laps to drivers. */
export function stintWindows(schedule: ScheduleStint[]): PlanStintWindow[] {
  return schedule.map((st) => ({
    startSec: st.startSec,
    endSec: st.endSec,
    driverName: st.driverName,
    trackTempC: st.trackTempC,
  }));
}

/**
 * Consistency: how close the driver's average racing lap sat to their own best.
 *
 * `1 − (Ø clean − best) ÷ best`. This is Johann Solowej's figure, so the team
 * can lay a CLS de-briefing next to his spreadsheet and read the same number —
 * with his transposed-digit bug (84600 instead of 86400, worth about 2 % on
 * every row) taken out.
 *
 * The scatter of the laps (`cleanStdSec`) is the better statistic in the
 * abstract, and it is still on the row for anyone who wants it. It is not the
 * headline figure because the team already reads this one, and a metric nobody
 * recognises is a metric nobody uses.
 */
function consistencyOf(row: RaceLogRow): number | null {
  if (row.cleanSec == null || row.bestSec == null) return null;
  if (row.bestSec <= 0) return null;
  // A handful of laps is a sample, not a consistency figure.
  if (row.cleanLaps < 5) return null;
  return 1 - (row.cleanSec - row.bestSec) / row.bestSec;
}

export function buildDebrief(input: DebriefInput): DebriefData {
  const {
    title,
    car,
    log,
    teamDrivers,
    schedule = [],
    official,
    paceCurve = null,
    ref10kSec = null,
    tempCorrection = null,
    stintDriverOverrides = [],
  } = input;

  const planStints = stintWindows(schedule);
  const model =
    input.model ??
    modelFromLog(log, {
      teamDrivers,
      planStints,
      tempCorrection,
      overrides: stintDriverOverrides,
    });
  const prognosis = prognosisByDriver(schedule);

  const teamBestSec = (() => {
    const xs = model.rows
      .map((r) => r.bestSec)
      .filter((n): n is number => n != null);
    return xs.length ? Math.min(...xs) : null;
  })();
  const classBestSec = log.classBestSec ?? null;
  const classReference = classBestSec ?? teamBestSec;

  const drivers = model.rows.map<DebriefDriver>((r) => {
    const refIRatingSec =
      official && paceCurve && paceCurve.length > 0 && r.iRating != null
        ? (targetLapSec(paceCurve, r.iRating)?.sec ?? null)
        : null;

    // The same ladder the dashboard uses: this driver's own iRating first,
    // then the fixed 10k yardstick in an official race, then the class best.
    let baselineSec: number | null;
    let baseline: DebriefBaseline;
    if (refIRatingSec != null) {
      baselineSec = refIRatingSec;
      baseline = "irating";
    } else if (official && ref10kSec != null) {
      baselineSec = ref10kSec;
      baseline = "ref10k";
    } else {
      baselineSec = classReference;
      baseline = classBestSec != null ? "classbest" : "teambest";
    }

    const planSec = prognosis.get(normName(r.name)) ?? null;
    const avgAllSec = r.avgSec;
    const avgCleanSec = r.cleanSec;
    const bestSec = r.bestSec;

    const hours =
      r.driveSec != null && r.driveSec > 0 ? r.driveSec / 3600 : null;

    return {
      name: r.name,
      slot: r.slot,
      iRating: r.iRating,
      laps: r.laps,
      stints: r.stints,
      driveSec: r.driveSec,
      avgAllSec,
      avgCleanSec,
      avgTempSec: r.tempLaps > 0 ? r.tempSec : null,
      planSec,
      bestSec,
      refIRatingSec,
      baselineSec,
      baseline,
      dAllVsClean:
        avgAllSec != null && avgCleanSec != null ? avgAllSec - avgCleanSec : null,
      dAllVsPlan:
        avgAllSec != null && planSec != null ? avgAllSec - planSec : null,
      dCleanVsBest:
        avgCleanSec != null && bestSec != null ? avgCleanSec - bestSec : null,
      dBestVsRef:
        bestSec != null && baselineSec != null ? bestSec - baselineSec : null,
      relPerf:
        refIRatingSec != null && bestSec != null && bestSec > 0
          ? refIRatingSec / bestSec
          : null,
      // Johann's normalisation: the gap to the reference as a share of the
      // REFERENCE, not of the driver's own lap. It differs from the
      // Relativperformance above (which divides by the driver's lap) only in
      // the second decimal, and matching his sheet is worth more than making
      // the two symmetrical.
      perf10k:
        ref10kSec != null && bestSec != null && ref10kSec > 0
          ? 1 - (bestSec - ref10kSec) / ref10kSec
          : null,
      consistency: consistencyOf(r),
      incidents: r.incidents,
      incPerHour:
        r.incidents != null && hours != null ? r.incidents / hours : null,
    };
  });

  const incidentsMeasured =
    (teamDrivers ?? []).length > 0 ||
    log.incidentSource === "dashboard" ||
    log.incidentSource === "sdk";

  const awards = buildAwards(drivers, incidentsMeasured);

  const notes: string[] = [];
  if (model.source === "inferred")
    notes.push(
      "Die Zuordnung der Stints wurde aus den Ergebnissen rekonstruiert, nicht aus dem Plan übernommen."
    );
  if (model.planDisagrees)
    notes.push(
      "Der Stintplan und die von iRacing gewerteten Runden widersprechen sich — es ist offenbar jemand anders gefahren als geplant."
    );
  if (!incidentsMeasured)
    notes.push(
      "In diesem Log wurden keine Incidents gemessen. Null bedeutet hier „nicht erfasst\", nicht „sauber gefahren\"."
    );
  if (official && !paceCurve?.length)
    notes.push(
      "Für dieses Rennen ist keine Pace-Kurve hinterlegt, deshalb fehlt die Relativperformance je iRating."
    );
  if (drivers.every((d) => d.planSec == null))
    notes.push(
      "Der Plan enthält keine Fahrerzuordnung, deshalb gibt es keine Prognose-Spalte."
    );

  return {
    title,
    track: log.track,
    car,
    sessionName: log.sessionName,
    official,
    classBestSec,
    ref10kSec,
    teamBestSec,
    drivers,
    awards,
    incidentsMeasured,
    attribution: model.source,
    notes,
  };
}

/** The five awards from Johann's deck, computed rather than typed. */
export function buildAwards(
  drivers: DebriefDriver[],
  incidentsMeasured: boolean
): DebriefAward[] {
  const best = <T,>(
    pick: (d: DebriefDriver) => number | null,
    better: (a: number, b: number) => boolean,
    fmt: (d: DebriefDriver, v: number) => string,
    key: DebriefAward["key"],
    label: string
  ): DebriefAward => {
    let win: DebriefDriver | null = null;
    let winV: number | null = null;
    for (const d of drivers) {
      const v = pick(d);
      if (v == null || !Number.isFinite(v)) continue;
      if (winV == null || better(v, winV)) {
        win = d;
        winV = v;
      }
    }
    return {
      key,
      label,
      winner: win?.name ?? null,
      value: win && winV != null ? fmt(win, winV) : "—",
    };
  };

  const out: DebriefAward[] = [
    best(
      (d) => d.bestSec,
      (a, b) => a < b,
      (_d, v) => fmtLap(v),
      "fastestLap",
      "Absolut schnellste Runde"
    ),
    best(
      (d) => d.avgCleanSec,
      (a, b) => a < b,
      (_d, v) => fmtLap(v),
      "fastestAverage",
      "Schnellste Durchschnittsrunde"
    ),
    best(
      (d) => d.consistency,
      (a, b) => a > b,
      (_d, v) => fmtPct(v),
      "consistency",
      "Beste Konstanz"
    ),
    best(
      (d) => d.relPerf ?? d.perf10k,
      (a, b) => a > b,
      (_d, v) => fmtPct(v),
      "relPerf",
      "Beste Relativperformance"
    ),
  ];

  // Safety only when something actually counted. Incidents per hour, so the
  // driver who took the most stints is not punished for being available.
  out.push(
    incidentsMeasured
      ? best(
          (d) => d.incPerHour,
          (a, b) => a < b,
          (d, v) =>
            `${v.toFixed(2).replace(".", ",")} Incs/h (${d.incidents} gesamt)`,
          "safest",
          "Sicherstes Rennen"
        )
      : {
          key: "safest",
          label: "Sicherstes Rennen",
          winner: null,
          value: "keine Incidents erfasst",
        }
  );
  return out;
}
