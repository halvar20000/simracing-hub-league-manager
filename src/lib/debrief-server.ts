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
import { buildDebrief, type DebriefData } from "@/lib/debrief";
import { normName } from "@/lib/race-log-model";
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
  planId: string;
  raceTitle: string;
  track: string | null;
  racedAt: Date;
  relPerfPpm: number | null;
  perf10kPpm: number | null;
  consistencyPpm: number | null;
};

export type DebriefHistory = {
  /** Race labels in chronological order — the x axis. */
  races: { planId: string; label: string; racedAt: Date }[];
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
): Promise<{ data: DebriefData; state: PlannerState } | null> {
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
  });
  return { data, state };
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
  racedAt: Date
): Promise<number> {
  const keep: string[] = [];
  for (const d of data.drivers) {
    const driverKey = normName(d.name);
    if (!driverKey) continue;
    keep.push(driverKey);
    const values = {
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
      laps: d.laps,
      stints: d.stints,
      driveSec: d.driveSec == null ? null : Math.round(d.driveSec),
      incidents: d.incidents,
    };
    await prisma.debriefMetric.upsert({
      where: { planId_driverKey: { planId: plan.id, driverKey } },
      create: { planId: plan.id, driverKey, ...values },
      update: values,
    });
  }
  await prisma.debriefMetric.deleteMany({
    where: { planId: plan.id, driverKey: { notIn: keep.length ? keep : [" "] } },
  });
  return keep.length;
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
  const keys = driverNames.map(normName).filter(Boolean);
  if (keys.length === 0) return { races: [], byDriver: new Map() };

  const rows = await prisma.debriefMetric.findMany({
    where: { driverKey: { in: keys } },
    orderBy: [{ racedAt: "asc" }, { planId: "asc" }],
    select: {
      planId: true,
      driverKey: true,
      raceTitle: true,
      track: true,
      racedAt: true,
      relPerfPpm: true,
      perf10kPpm: true,
      consistencyPpm: true,
    },
  });

  const races: { planId: string; label: string; racedAt: Date }[] = [];
  for (const r of rows) {
    if (races.some((x) => x.planId === r.planId)) continue;
    races.push({
      planId: r.planId,
      label: r.raceTitle || r.track || "Rennen",
      racedAt: r.racedAt,
    });
  }

  const byDriver = new Map<string, (DebriefHistoryPoint | null)[]>();
  for (const name of driverNames) {
    const key = normName(name);
    const mine = races.map((race) => {
      const hit = rows.find(
        (r) => r.planId === race.planId && r.driverKey === key
      );
      return hit
        ? {
            planId: hit.planId,
            raceTitle: hit.raceTitle,
            track: hit.track,
            racedAt: hit.racedAt,
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
