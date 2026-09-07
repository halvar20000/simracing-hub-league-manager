import "server-only";

import { prisma } from "@/lib/prisma";
import {
  hydratePlanState,
  stateToInput,
  type PlannerState,
} from "@/lib/stint-plan-state";
import { buildSchedule } from "@/lib/stint-planner";
import {
  parseLapInput,
  targetLapSec,
  parsePacePoints,
  type PacePoint,
} from "@/lib/pace-reference";
import { buildDebrief, stintWindows, type DebriefData } from "@/lib/debrief";
import { modelFromLog } from "@/lib/race-log-model";
import {
  buildDebriefRace,
  type DebriefRaceDetail,
} from "@/lib/debrief-stints";
/**
 * The key a driver is filed under in the history.
 *
 * Deliberately harsher than the model's per-race name matching: iRacing, the
 * stint plan and a spreadsheet somebody typed disagree about accents — "Andre"
 * with and without the acute is one person, and a trend that splits them in
 * two is worse than useless. Folding diacritics here (and not in the model)
 * keeps the per-race matching exact while letting the season history join
 * across sources.
 */
export function driverHistoryKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
import type { TempCorrection } from "@/lib/race-log-attribution";

/**
 * Turn a saved stint plan into the debriefing dataset.
 *
 * Everything the numbers rest on is already in the plan's payload; this only
 * resolves the one thing that is not — the shared pace curve the plan points
 * at — and then hands the pure builder its inputs. The page, the .pptx export
 * and the history writer all come through here, so there is exactly one
 * definition of "the debriefing for plan X".
 */

export type PlanRow = {
  id: string;
  title: string;
  payload: unknown;
  updatedAt: Date;
};

/** One race in a driver's trend. */
export type DebriefHistoryPoint = {
  sourceKey: string;
  raceTitle: string;
  track: string | null;
  racedAt: Date;
  /** "cls" = measured here, "import" = taken from the team's own sheet. */
  source: string;
  relPerfPpm: number | null;
  perf10kPpm: number | null;
  consistencyPpm: number | null;
};

export type DebriefRace = {
  sourceKey: string;
  label: string;
  racedAt: Date;
  source: string;
};

export type DebriefHistory = {
  /** Races in chronological order — the x axis. */
  races: DebriefRace[];
  /** driver name -> one entry per race (null where they did not drive it). */
  byDriver: Map<string, (DebriefHistoryPoint | null)[]>;
};

/**
 * When the race ran.
 *
 * The plan's own session start is the honest answer; a plan with none falls
 * back to when it was last saved, which for a debriefing is within hours of
 * the race. Never now() — that would move every time the row is rewritten and
 * scramble the order of the trend.
 */
export function racedAtOf(state: PlannerState, plan: PlanRow): Date {
  const raw = state.event.sessionStartLocal?.trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return plan.updatedAt;
}

async function paceCurveFor(state: PlannerState): Promise<PacePoint[] | null> {
  const id = state.event.paceCurveId?.trim();
  if (!id) return null;
  const row = await prisma.paceReference.findUnique({
    where: { id },
    select: { points: true },
  });
  if (!row) return null;
  const pts = parsePacePoints(row.points);
  return pts.length ? pts : null;
}

/** The debriefing for one plan, or null when it has no race log yet. */
export async function debriefForPlan(
  plan: PlanRow
): Promise<{
  data: DebriefData;
  race: DebriefRaceDetail;
  state: PlannerState;
} | null> {
  const state = hydratePlanState(plan.payload, plan.title);
  if (!state.raceLog) return null;

  const schedule = buildSchedule(stateToInput(state)).stints;
  const paceCurve = await paceCurveFor(state);
  const official = state.event.raceKind === "official";
  const ref10kSec =
    parseLapInput(state.event.refLap) ??
    (paceCurve ? (targetLapSec(paceCurve, 10000)?.sec ?? null) : null);

  // A temperature correction is only offered on a MEASURED slope. The
  // planner's 0.1 s/degC default is a placeholder, and a corrected lap time
  // built on a placeholder is a guess wearing a measurement's clothes.
  const slope = state.tempModel?.slopePerC ?? null;
  const baseC =
    state.event.trackTempC.trim() !== "" &&
    Number.isFinite(Number(state.event.trackTempC))
      ? Number(state.event.trackTempC)
      : null;
  const planTemps = schedule
    .filter((st) => st.trackTempC != null && st.endSec > st.startSec)
    .map((st) => ({
      startSec: st.startSec,
      endSec: st.endSec,
      trackTempC: st.trackTempC as number,
    }));
  const tempCorrection: TempCorrection | null =
    slope != null && Number.isFinite(slope) && baseC != null
      ? {
          slopePerC: slope,
          baseC,
          tempOf: (l) => {
            if (l.tc != null) return l.tc;
            if (l.t == null) return null;
            const lt = l.t;
            const w = planTemps.find((p) => lt >= p.startSec && lt <= p.endSec);
            return w?.trackTempC ?? null;
          },
        }
      : null;

  // Built once and shared: the metric table, the lap chart, the stint table
  // and the timeline all read the same attribution, and walking the trace
  // twice for one request is waste on a twelve-hour log.
  const model = modelFromLog(state.raceLog, {
    teamDrivers: state.eventResult?.ownDrivers,
    planStints: stintWindows(schedule),
    tempCorrection,
    overrides: state.raceLog.stintDrivers ?? [],
  });

  const data = buildDebrief({
    title: plan.title,
    car: state.event.car || null,
    log: state.raceLog,
    teamDrivers: state.eventResult?.ownDrivers,
    schedule,
    official,
    paceCurve,
    ref10kSec,
    tempCorrection,
    stintDriverOverrides: state.raceLog.stintDrivers ?? [],
    model,
  });
  const race = buildDebriefRace(state.raceLog, model, schedule);
  return { data, race, state };
}

const msOf = (sec: number | null | undefined): number | null =>
  sec == null || !Number.isFinite(sec) ? null : Math.round(sec * 1000);
const ppmOf = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 1_000_000);

/**
 * Freeze this plan's debriefing figures into the history table.
 *
 * Upsert on (planId, driverKey): re-generating a debriefing corrects its own
 * rows and touches nobody else's. Drivers who have since been taken off the
 * plan are removed, so a corrected line-up leaves no ghost in the trend.
 */
export async function writeDebriefHistory(
  plan: PlanRow,
  data: DebriefData,
  racedAt: Date,
  team?: { teamGroup: string | null; teamName: string | null },
  /** The race detail and the plan's practice import, when the caller has
   *  them — they are what the per-driver page is built from. */
  extra?: { race: DebriefRaceDetail; state: PlannerState }
): Promise<number> {
  // Practice figures keyed the same way as everything else in the history.
  const g61 = (() => {
    const rows = extra?.state.g61Analysis?.drivers;
    if (!rows?.length) return null;
    const m = new Map<
      string,
      { racePaceSec: number; bestSec: number; laps: number }
    >();
    for (const r of rows)
      m.set(driverHistoryKey(r.driver), {
        racePaceSec: r.racePaceSec,
        bestSec: r.bestSec,
        laps: r.laps,
      });
    return m;
  })();

  const keep: string[] = [];
  for (const d of data.drivers) {
    const driverKey = driverHistoryKey(d.name);
    if (!driverKey) continue;
    keep.push(driverKey);
    const values = {
      source: "cls",
      sourceKey: plan.id,
      teamGroup: team?.teamGroup ?? null,
      teamName: team?.teamName ?? null,
      planId: plan.id,
      driverName: d.name,
      raceTitle: data.title,
      track: data.track,
      car: data.car,
      racedAt,
      iRating: d.iRating,
      avgAllMs: msOf(d.avgAllSec),
      avgCleanMs: msOf(d.avgCleanSec),
      planMs: msOf(d.planSec),
      bestMs: msOf(d.bestSec),
      refIRatingMs: msOf(d.refIRatingSec),
      ref10kMs: msOf(data.ref10kSec),
      relPerfPpm: ppmOf(d.relPerf),
      perf10kPpm: ppmOf(d.perf10k),
      consistencyPpm: ppmOf(d.consistency),
      incPerHourPpm: ppmOf(d.incPerHour),
      // Practice pace for the same track and car, when the plan carries a
      // Garage 61 import. Matched on the folded name, because Garage 61 and
      // iRacing disagree about accents as readily as everything else.
      g61MedianMs: msOf(g61?.get(driverKey)?.racePaceSec ?? null),
      g61BestMs: msOf(g61?.get(driverKey)?.bestSec ?? null),
      g61Laps: g61?.get(driverKey)?.laps ?? null,
      laps: d.laps,
      stints: d.stints,
      driveSec: d.driveSec == null ? null : Math.round(d.driveSec),
      incidents: d.incidents,
    };
    await prisma.debriefMetric.upsert({
      where: { sourceKey_driverKey: { sourceKey: plan.id, driverKey } },
      create: { driverKey, ...values },
      update: values,
    });
  }
  await prisma.debriefMetric.deleteMany({
    where: {
      sourceKey: plan.id,
      driverKey: { notIn: keep.length ? keep : [" "] },
    },
  });

  if (extra) await writeDebriefStints(plan, extra.race, extra.state, racedAt, team);
  return keep.length;
}

/**
 * Freeze the stints too.
 *
 * The per-race row says how somebody drove that race; these say how they drove
 * ACROSS it — whether the pace falls away in a double stint, whether the first
 * stint is always the ragged one, what the night cost. An average hides all
 * three, and none of it can be recomputed later once a plan is edited.
 */
async function writeDebriefStints(
  plan: PlanRow,
  race: DebriefRaceDetail,
  state: PlannerState,
  racedAt: Date,
  team?: { teamGroup: string | null; teamName: string | null }
): Promise<void> {
  // Wall-clock hour a stint began, so a season can answer "how does he drive
  // at four in the morning". Only when the plan carries a session start —
  // guessing one would put a night stint in the afternoon.
  const startMs = (() => {
    const raw = state.event.sessionStartLocal?.trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  })();

  const kept: number[] = [];
  for (const st of race.stints) {
    if (!st.driver) continue;
    kept.push(st.index);
    const values = {
      planId: plan.id,
      driverKey: driverHistoryKey(st.driver),
      driverName: st.driver,
      teamGroup: team?.teamGroup ?? null,
      raceTitle: plan.title,
      track: state.raceLog?.track ?? (state.event.track || null),
      racedAt,
      startLap: st.startLap,
      endLap: st.endLap,
      laps: st.laps,
      avgMs: msOf(st.avgSec),
      bestMs: msOf(st.bestSec),
      planMs: msOf(st.planSec),
      deltaMs: msOf(st.deltaSec),
      pitMs: msOf(st.pitSec),
      incidents: st.incidents,
      startSec: st.startSec == null ? null : Math.round(st.startSec),
      endSec: st.endSec == null ? null : Math.round(st.endSec),
      startHour:
        startMs != null && st.startSec != null
          ? new Date(startMs + st.startSec * 1000).getHours()
          : null,
    };
    await prisma.debriefStintMetric.upsert({
      where: {
        sourceKey_stintIndex: { sourceKey: plan.id, stintIndex: st.index },
      },
      create: { sourceKey: plan.id, stintIndex: st.index, ...values },
      update: values,
    });
  }
  await prisma.debriefStintMetric.deleteMany({
    where: {
      sourceKey: plan.id,
      stintIndex: { notIn: kept.length ? kept : [-1] },
    },
  });
}

/**
 * The season trend for a set of drivers.
 *
 * Only races those drivers actually appear in become columns, so a chart for
 * one team is not stretched across every plan in the database.
 */
export async function readDebriefHistory(
  driverNames: string[]
): Promise<DebriefHistory> {
  const keys = driverNames.map(driverHistoryKey).filter(Boolean);
  if (keys.length === 0) return { races: [], byDriver: new Map() };

  const rows = await prisma.debriefMetric.findMany({
    where: { driverKey: { in: keys } },
    orderBy: [{ racedAt: "asc" }, { sourceKey: "asc" }],
    select: {
      sourceKey: true,
      source: true,
      driverKey: true,
      raceTitle: true,
      track: true,
      racedAt: true,
      relPerfPpm: true,
      perf10kPpm: true,
      consistencyPpm: true,
    },
  });

  const races: DebriefRace[] = [];
  for (const r of rows) {
    if (races.some((x) => x.sourceKey === r.sourceKey)) continue;
    races.push({
      sourceKey: r.sourceKey,
      label: r.raceTitle || r.track || "Rennen",
      racedAt: r.racedAt,
      source: r.source,
    });
  }

  const byDriver = new Map<string, (DebriefHistoryPoint | null)[]>();
  for (const name of driverNames) {
    const key = driverHistoryKey(name);
    const mine = races.map((race) => {
      const hit = rows.find(
        (r) => r.sourceKey === race.sourceKey && r.driverKey === key
      );
      return hit
        ? {
            sourceKey: hit.sourceKey,
            raceTitle: hit.raceTitle,
            track: hit.track,
            racedAt: hit.racedAt,
            source: hit.source,
            relPerfPpm: hit.relPerfPpm,
            perf10kPpm: hit.perf10kPpm,
            consistencyPpm: hit.consistencyPpm,
          }
        : null;
    });
    byDriver.set(name, mine);
  }
  return { races, byDriver };
}
