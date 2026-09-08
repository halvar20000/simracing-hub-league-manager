"use client";

import { useMemo, useState } from "react";
import type {
  LapExclusion,
  PlannerRaceLog,
  TeamDriverStat,
} from "@/lib/stint-plan-state";
import { targetLapSec, fmtPaceSec, type PacePoint } from "@/lib/pace-reference";
import {
  describeExclusions,
  type TempCorrection,
  type PlanStintWindow,
} from "@/lib/race-log-attribution";
import {
  buildRaceLogModel,
  percentile,
  type RaceLogRow,
} from "@/lib/race-log-model";
import { useT } from "@/components/planner/PlannerUi";

/**
 * Team-performance dashboard for an uploaded race-logger JSONL.
 *
 * Scope is deliberately OUR car only: how our drivers compared with each other
 * over the race. The single outside number is the fastest lap in our class,
 * drawn as a reference line so the gap is visible without listing the field.
 *
 * TEAM EVENTS: the race logger reports one driver name per car for the whole
 * race — it never sees driver swaps. So laps / best / average / incidents come
 * from the event result (iRacing's own per-driver scoring), and the stint split
 * used to colour the trace is RECONSTRUCTED (see race-log-attribution.ts) and
 * labelled as such. Solo races fall back to the log's own names, which are
 * correct there.
 *
 * Colours are the validated categorical slots for a dark surface (blue,
 * orange, aqua, yellow, magenta, violet — adjacent-pair CVD ΔE ≥ 8.4 on
 * #09090b). Slots are assigned per driver and never cycled or re-assigned.
 */

const SERIES = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#9085e9", // violet
] as const;

const SURFACE = "#09090b"; // zinc-950 — the card surface behind the charts
const GRID = "#27272a"; // zinc-800 — recessive gridlines
const REFERENCE = "#a1a1aa"; // zinc-400 — the class-best reference line
const UNKNOWN = "#52525b"; // zinc-600 — laps we could not attribute

const colorFor = (slot: number) =>
  slot < 0 ? UNKNOWN : SERIES[Math.min(slot, SERIES.length - 1)];

/** 92.418 → "1:32.418" */
export function fmtLapSec(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
}

const fmtGap = (sec: number | null | undefined): string =>
  sec == null || !isFinite(sec)
    ? "—"
    : `${sec >= 0 ? "+" : "−"}${Math.abs(sec).toFixed(3)}`;

/** The dashboard's row IS the shared model's row — see race-log-model.ts.
 *  Keeping the alias means the chart components below read unchanged. */
type Row = RaceLogRow;


export default function RaceLogDashboard({
  log,
  teamDrivers,
  planStints,
  official = false,
  paceCurve = null,
  refLapSec = null,
  tempSlopePerC = null,
  baseTempC = null,
  stintDriverOverrides,
  onStintDriverChange,
}: {
  log: PlannerRaceLog;
  /** Our drivers from the uploaded event result — the authoritative stats. */
  teamDrivers?: TeamDriverStat[];
  /** This plan's own stint order — the best source for who drove when. */
  planStints?: PlanStintWindow[];
  /** Official race: measure each driver against his own iRating, not against
   *  the fastest man on a grid he did not choose. */
  official?: boolean;
  /** iRating → lap time for this track and car class. */
  paceCurve?: PacePoint[] | null;
  /** The fixed yardstick (a ≈10k iRating lap), when the plan carries one. */
  refLapSec?: number | null;
  /**
   * Seconds of lap time per °C, MEASURED — the plan's Garage 61 temperature
   * fit. Null when there is none, and then no temperature correction is
   * offered at all: the planner's 0.1 s/°C default is a placeholder, and a
   * corrected lap time built on a placeholder is a guess that looks like a
   * measurement.
   */
  tempSlopePerC?: number | null;
  /** The temperature laps are corrected TO — the plan's own Track temp. */
  baseTempC?: number | null;
  /** Hand corrections: stint index → driver name, for the stints where the
   *  automatic answer was wrong. Saved with the plan. */
  stintDriverOverrides?: (string | null)[];
  /** Called when someone corrects a stint's driver. Absent = read-only. */
  onStintDriverChange?: (stintIndex: number, driverName: string | null) => void;
}) {
  const t = useT();
  const laps = useMemo(() => log.laps ?? [], [log.laps]);
  const logDrivers = useMemo(() => log.drivers ?? [], [log.drivers]);
  const stints = useMemo(() => log.stints ?? [], [log.stints]);
  const overrides = useMemo(
    () => stintDriverOverrides ?? [],
    [stintDriverOverrides]
  );
  /** Which average the gap chart shows. "clean" leads; "temp" appears only
   *  when a measured slope and real temperatures exist; "iracing" is the raw
   *  figure the results page shows, kept because someone always wants to
   *  reconcile the two. */
  const [avgMode, setAvgMode] = useState<"clean" | "temp" | "iracing">("clean");
  /** Did the parser mark WHY each lap is out? Logs uploaded before that only
   *  support the in/out fallback and can be brought up to date by re-analysing. */
  const marked = (log.exclV ?? 1) >= 2;

  /**
   * Track temperature for one lap: the logger's own sample when the log has
   * them, otherwise the temperature the pit wall typed for the stint that lap
   * ran in. The second source is coarser — one figure per stint — but it is
   * what every log written before the logger sampled weather can offer, and
   * it is a real observation rather than an interpolation of nothing.
   */
  const planTemps = useMemo(
    () =>
      (planStints ?? []).filter(
        (p) => p.trackTempC != null && p.endSec > p.startSec
      ),
    [planStints]
  );
  const tempCorrection = useMemo<TempCorrection | null>(() => {
    if (tempSlopePerC == null || !Number.isFinite(tempSlopePerC)) return null;
    if (baseTempC == null || !Number.isFinite(baseTempC)) return null;
    const tempOf = (l: { tc?: number; t?: number }): number | null => {
      if (l.tc != null) return l.tc;
      if (l.t == null) return null;
      const lt = l.t;
      const w = planTemps.find((p) => lt >= p.startSec && lt <= p.endSec);
      return w?.trackTempC ?? null;
    };
    return { slopePerC: tempSlopePerC, baseC: baseTempC, tempOf };
  }, [tempSlopePerC, baseTempC, planTemps]);

  // The whole model — who drove which stint, and every per-driver figure —
  // lives in src/lib/race-log-model.ts so that this dashboard, the debriefing
  // page and the .pptx export cannot drift apart.
  const model = useMemo(
    () =>
      buildRaceLogModel({
        laps,
        logDrivers,
        stints,
        teamDrivers,
        planStints,
        marked,
        tempCorrection,
        overrides,
      }),
    [
      teamDrivers,
      planStints,
      logDrivers,
      laps,
      stints,
      marked,
      tempCorrection,
      overrides,
    ]
  );

  const {
    rows,
    lapRow,
    stintRow,
    source,
    confident,
    planCheck,
    planDisagrees,
    overridden,
    autoStintRow,
  } = model;
  const inferred = source === "inferred";
  const fromPlan = source === "plan";

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{t.rlog.noLapData}</p>;
  }

  // The clean average is the better number, so it leads — but iRacing's own
  // average stays one click away, because that is what the results page shows
  // and someone will always want to reconcile the two.
  const haveClean = rows.some((r) => r.cleanSec != null);
  /** A temperature-corrected average is only offered when there is a measured
   *  slope AND laps that actually carry a temperature. */
  const haveTemp = tempCorrection != null && rows.some((r) => r.tempLaps > 0);
  /** A mode that is not available falls back rather than showing blanks. */
  const mode: "clean" | "temp" | "iracing" =
    avgMode === "temp" && !haveTemp ? "clean" : avgMode;
  const tempCorrectedTotal = rows.reduce((a, r) => a + r.tempLaps, 0);
  const tempSkippedTotal = rows.reduce((a, r) => a + r.tempSkipped, 0);
  /** Where each lap's temperature came from — worth naming, because one is
   *  measured every 30 s and the other is one figure typed per stint. */
  const tempFromLog = laps.some((l) => l.tc != null);
  /**
   * Were incidents ever actually measured?
   *
   * The race logger takes them from the broadcast dashboard, and a driver
   * running the standalone logger at home has none — so the log carries zero
   * incidents whether the race was clean or a demolition derby. Only claim a
   * clean race when something says it looked: the results file (iRacing's own
   * scoring) or a logger that recorded which source it used.
   */
  const incidentsMeasured =
    // The eventresult carries iRacing's own per-driver incident count, so its
    // presence IS the measurement.
    (teamDrivers ?? []).length > 0 ||
    log.incidentSource === "dashboard" ||
    log.incidentSource === "sdk";
  const avgOf = (r: Row): number | null =>
    mode === "iracing"
      ? r.avgSec
      : mode === "temp"
        ? (r.tempSec ?? r.cleanSec ?? r.avgSec)
        : (r.cleanSec ?? r.avgSec);
  const droppedTotal = rows.reduce((a, r) => a + r.cleanDropped, 0);
  /** All drivers' exclusion reasons added up, for the note under the chart. */
  const droppedByReason = rows.reduce<Partial<Record<LapExclusion, number>>>(
    (acc, r) => {
      for (const [k, n] of Object.entries(r.cleanByReason)) {
        const key = k as LapExclusion;
        acc[key] = (acc[key] ?? 0) + (n ?? 0);
      }
      return acc;
    },
    {}
  );
  const droppedNote = describeExclusions(droppedByReason, t.rlog);

  const teamBest = (() => {
    const xs = rows.map((r) => r.bestSec).filter((n): n is number => n != null);
    return xs.length ? Math.min(...xs) : null;
  })();
  const classReference = log.classBestSec ?? teamBest;

  // ---- what each driver is measured against ------------------------------
  // League: the fastest lap in class — everyone runs the same car at a similar
  // level, so it is a fair yardstick and it is what the team recognises.
  // Official: the lap THIS driver's iRating was worth here. A 1500 iR driver
  // and a 6000 iR driver on the same grid are not doing the same job, and
  // measuring both against the fastest man tells you their pedigree, not their
  // performance. Falls back to the fixed 10k reference for a driver whose
  // rating the results file does not carry, and to the class best beyond that.
  const targets = rows.map((r) =>
    official && paceCurve && paceCurve.length > 0 && r.iRating != null
      ? (targetLapSec(paceCurve, r.iRating)?.sec ?? null)
      : null
  );
  const haveTargets = targets.some((t) => t != null);
  const baselineOf = (i: number): number | null =>
    targets[i] ?? (official ? (refLapSec ?? classReference) : classReference);
  /** How the row was measured, for the tooltip — a gap is meaningless without
   *  saying what it is a gap TO. */
  const baselineLabelOf = (i: number): string => {
    if (targets[i] != null) {
      return t.rlog.baselineTarget(rows[i].iRating ?? "?", fmtPaceSec(targets[i]));
    }
    if (official && refLapSec != null)
      return t.rlog.baseline10k(fmtPaceSec(refLapSec));
    return t.rlog.baselineClass(fmtPaceSec(classReference));
  };
  const reference = classReference;

  return (
    <div className="space-y-5">
      {planDisagrees && (
        <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          <span className="font-semibold">{t.rlog.planDisagreesTitle}</span>{" "}
          {t.rlog.planDisagreesBody(
            planCheck?.worstDriver ?? t.rlog.aDriver,
            planCheck?.worstDelta ?? "?"
          )}
        </p>
      )}
      {overridden > 0 && (
        <p className="rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
          {t.rlog.overridden(overridden)}
        </p>
      )}
      {(fromPlan || inferred) && (
        <p className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300">{t.rlog.teamEventTitle}</span>{" "}
          {t.rlog.teamEventPre}{" "}
          <span className="font-mono">eventresult.json</span> {t.rlog.teamEventMid}{" "}
          {fromPlan ? (
            <>
              <span className="font-semibold text-zinc-300">
                {t.rlog.teamEventPlanBold}
              </span>{" "}
              {t.rlog.teamEventPlanPost}
            </>
          ) : (
            <>
              {t.rlog.teamEventInferredPre} <em>{t.rlog.teamEventInferredEm}</em>{" "}
              {t.rlog.teamEventInferredPost}
            </>
          )}
          {inferred && !confident && (
            <span className="ml-1 text-amber-300">{t.rlog.notConfident}</span>
          )}
        </p>
      )}

      {/* Per-driver summary — also the table view for the charts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((d, di) => (
          <div
            key={d.name}
            className="rounded border border-zinc-800 bg-zinc-950/60 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(d.slot) }}
              />
              <span className="truncate text-sm font-semibold text-zinc-100">
                {d.name}
              </span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-zinc-50">
              {fmtLapSec(d.bestSec)}
            </div>
            <div className="text-xs text-zinc-500">{t.rlog.bestLap}</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt className="text-zinc-500">{t.rlog.laps}</dt>
              <dd className="text-right text-zinc-200">{d.laps ?? "—"}</dd>
              <dt className="text-zinc-500">{t.rlog.average}</dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.avgSec)}</dd>
              <dt className="text-zinc-500" title={t.rlog.cleanAvgHint}>
                {t.rlog.cleanAvg}
                {source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd
                className="text-right text-zinc-200"
                title={
                  d.cleanLaps
                    ? t.rlog.cleanCell(
                        d.cleanLaps,
                        d.cleanDropped,
                        describeExclusions(d.cleanByReason, t.rlog)
                      )
                    : t.rlog.cleanCellNone
                }
              >
                {fmtLapSec(d.cleanSec)}
              </dd>
              <dt className="text-zinc-500">{t.rlog.incidents}</dt>
              <dd
                className={`text-right ${
                  (d.incidents ?? 0) > 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {d.incidents ?? "—"}
              </dd>
              <dt className="text-zinc-500">
                {t.rlog.greenPace}
                {source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.greenSec)}</dd>
              {official && targets[di] != null && (
                <>
                  <dt
                    className="text-zinc-500"
                    title={t.rlog.targetHint(d.iRating ?? "?")}
                  >
                    {t.rlog.target(d.iRating ?? "?")}
                  </dt>
                  <dd className="text-right text-cyan-300">
                    {fmtPaceSec(targets[di])}
                  </dd>
                </>
              )}
              <dt className="text-zinc-500">
                {t.rlog.spread}
                {source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">
                {d.spreadSec == null ? "—" : `${d.spreadSec.toFixed(3)} s`}
              </dd>
              <dt className="text-zinc-500">
                {t.rlog.stints}
                {source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">{d.stints}</dd>
            </dl>
          </div>
        ))}
      </div>
      {source !== "log" && (
        <p className="-mt-3 text-[11px] text-zinc-600">
          {fromPlan ? t.rlog.footnotePlan : t.rlog.footnoteInferred}
        </p>
      )}

      <LapTrace
        laps={laps}
        lapRow={lapRow}
        rows={rows}
        log={log}
        source={source}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <GapBars
          title={t.rlog.gapBest}
          rows={rows}
          values={rows.map((r) =>
            r.bestSec != null && reference != null ? r.bestSec - reference : null
          )}
          absolutes={rows.map((r) => r.bestSec)}
        />
        <GapBars
          title={
            official && haveTargets
              ? t.rlog.gapAvgTarget
              : official && refLapSec != null
                ? t.rlog.gapAvg10k
                : t.rlog.gapAvgClass
          }
          note={
            mode === "temp"
              ? t.rlog.noteTemp(
                  `${baseTempC}\u00a0`,
                  `${tempSlopePerC}\u00a0`,
                  tempCorrectedTotal,
                  tempSkippedTotal > 0
                    ? t.rlog.noteTempSkipped(tempSkippedTotal)
                    : "",
                  tempFromLog ? t.rlog.noteTempFromLog : t.rlog.noteTempFromPlan
                )
              : mode === "clean"
                ? marked
                  ? t.rlog.noteCleanMarked(
                      droppedTotal > 0
                        ? t.rlog.noteCleanDropped(droppedTotal, droppedNote)
                        : ""
                    )
                  : t.rlog.noteCleanOld(
                      droppedTotal > 0 ? t.rlog.noteCleanOldDropped(droppedTotal) : ""
                    )
                : t.rlog.noteIracing
          }
          action={
            haveClean && (
              <button
                type="button"
                onClick={() =>
                  setAvgMode((m) =>
                    m === "clean"
                      ? haveTemp
                        ? "temp"
                        : "iracing"
                      : m === "temp"
                        ? "iracing"
                        : "clean"
                  )
                }
                className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                title={haveTemp ? t.rlog.cycleHintTemp : t.rlog.cycleHintNoTemp}
              >
                {mode === "clean"
                  ? t.rlog.cleanAvg
                  : mode === "temp"
                    ? t.rlog.modeTemp
                    : t.rlog.modeIracing}
              </button>
            )
          }
          rows={rows}
          values={rows.map((r, i) => {
            const v = avgOf(r);
            const base = baselineOf(i);
            return v != null && base != null ? v - base : null;
          })}
          absolutes={rows.map((r) => avgOf(r))}
          baselineLabels={rows.map((_, i) => baselineLabelOf(i))}
          extraNote={
            official
              ? haveTargets
                ? t.rlog.extraTargets(
                    refLapSec != null
                      ? t.rlog.extraTargetsRef(fmtPaceSec(refLapSec))
                      : ""
                  )
                : paceCurve && paceCurve.length > 0
                  ? t.rlog.extraNoRatings
                  : t.rlog.extraNoCurve
              : undefined
          }
        />
        <CountBars
          title={t.rlog.lapsDriven}
          rows={rows}
          values={rows.map((r) => r.laps ?? 0)}
        />
        <CountBars
          title={t.rlog.incPerStint}
          note={t.rlog.incPerStintNote}
          rows={rows}
          values={rows.map((r) =>
            r.stints > 0 ? (r.incidents ?? 0) / r.stints : (r.incidents ?? 0)
          )}
          labels={rows.map((r) => {
            const inc = r.incidents ?? 0;
            if (r.stints <= 0) return t.rlog.incUnknownStints(inc);
            return t.rlog.incRate((inc / r.stints).toFixed(1), inc, r.stints);
          })}
          emptyNote={incidentsMeasured ? t.rlog.incNone : t.rlog.incNotRecorded}
        />
      </div>

      {stints.length > 0 && (
        <StintTable
          log={log}
          rows={rows}
          stintRow={stintRow}
          autoStintRow={autoStintRow}
          source={source}
          overrides={overrides}
          onStintDriverChange={onStintDriverChange}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lap trace

function LapTrace({
  laps,
  lapRow,
  rows,
  log,
  source,
}: {
  laps: PlannerRaceLog["laps"];
  lapRow: number[];
  rows: Row[];
  log: PlannerRaceLog;
  source: "plan" | "inferred" | "log";
}) {
  const t = useT();
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);

  const W = 820;
  const H = 280;
  const P = useMemo(() => ({ l: 58, r: 16, t: 14, b: 28 }), []);

  const model = useMemo(() => {
    if (laps.length === 0) return null;
    const secs = laps.map((l) => l.sec);
    const minSec = Math.min(...secs, log.classBestSec ?? Infinity);
    // Clip the top so pit-in and caution laps don't flatten the racing laps.
    const p90 = percentile(secs, 0.9) ?? Math.max(...secs);
    const yMax = Math.max(minSec * 1.02, Math.min(p90 * 1.03, minSec * 1.15));
    const yMin = minSec * 0.998;
    const lapNums = laps.map((l) => l.lap);
    const xMin = Math.min(...lapNums);
    const xMax = Math.max(...lapNums);
    const x = (lap: number) =>
      P.l + ((lap - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
    const y = (sec: number) =>
      P.t + ((yMax - sec) / Math.max(0.001, yMax - yMin)) * (H - P.t - P.b);

    // Segment the trace: a new segment on driver change, a lap gap, or a lap
    // that leaves the scale — never bridge a break with a straight line.
    const segments: { d: number; pts: { x: number; y: number }[] }[] = [];
    let cur: { d: number; pts: { x: number; y: number }[] } | null = null;
    let prevLap: number | null = null;
    let above = 0;
    laps.forEach((l, i) => {
      const d = lapRow[i] ?? -1;
      if (l.sec > yMax) {
        above += 1;
        cur = null;
        prevLap = l.lap;
        return;
      }
      if (cur == null || cur.d !== d || (prevLap != null && l.lap - prevLap > 1)) {
        cur = { d, pts: [] };
        segments.push(cur);
      }
      cur.pts.push({ x: x(l.lap), y: y(l.sec) });
      prevLap = l.lap;
    });

    const ticks: number[] = [];
    const step = (yMax - yMin) / 4;
    for (let i = 0; i <= 4; i++) ticks.push(yMin + step * i);

    return { x, y, yMin, yMax, xMin, xMax, segments, ticks, above };
  }, [laps, lapRow, log.classBestSec, P]);

  if (!model) return null;

  const hovered = hover ? laps[hover.i] : null;
  const hoveredRow = hover ? rows[lapRow[hover.i] ?? -1] : undefined;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let bestI = -1;
    let bestD = Infinity;
    laps.forEach((l, i) => {
      const d = Math.abs(model.x(l.lap) - px);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI >= 0) setHover({ x: model.x(laps[bestI].lap), i: bestI });
  };

  return (
    <figure className="relative rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-200">
          {t.rlog.traceTitle}
          {source !== "log" && (
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-zinc-400">
              {source === "plan"
                ? t.rlog.badgeFromPlan
                : t.rlog.badgeReconstructed}
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-500">
          {model.above > 0 ? t.rlog.aboveScale(model.above) : t.rlog.allInScale}
        </span>
      </figcaption>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        {rows.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: colorFor(d.slot) }}
            />
            {d.name}
          </span>
        ))}
        {log.classBestSec != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed border-zinc-400" />
            {t.rlog.classBest}
            {log.ownCarClass ? ` (${log.ownCarClass})` : ""}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={t.rlog.traceAria}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {model.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={model.y(t)}
              y2={model.y(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={P.l - 8}
              y={model.y(t) + 4}
              textAnchor="end"
              className="fill-zinc-500"
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            >
              {fmtLapSec(t)}
            </text>
          </g>
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const lap = Math.round(model.xMin + (model.xMax - model.xMin) * f);
          return (
            <text
              key={i}
              x={model.x(lap)}
              y={H - 8}
              textAnchor="middle"
              className="fill-zinc-500"
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            >
              L{lap}
            </text>
          );
        })}

        {log.classBestSec != null && log.classBestSec >= model.yMin && (
          <g>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={model.y(log.classBestSec)}
              y2={model.y(log.classBestSec)}
              stroke={REFERENCE}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={W - P.r}
              y={model.y(log.classBestSec) - 5}
              textAnchor="end"
              className="fill-zinc-400"
              style={{ fontSize: 11 }}
            >
              class best {fmtLapSec(log.classBestSec)}
            </text>
          </g>
        )}

        {model.segments.map((seg, i) =>
          seg.pts.length < 2 ? (
            seg.pts.length === 1 ? (
              <circle
                key={i}
                cx={seg.pts[0].x}
                cy={seg.pts[0].y}
                r={2.5}
                fill={colorFor(rows[seg.d]?.slot ?? -1)}
              />
            ) : null
          ) : (
            <polyline
              key={i}
              points={seg.pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={colorFor(rows[seg.d]?.slot ?? -1)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        )}

        {laps
          .filter((l) => l.pit)
          .map((l, i) => (
            <g key={`pit-${i}`}>
              <line
                x1={model.x(l.lap)}
                x2={model.x(l.lap)}
                y1={P.t}
                y2={H - P.b}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={model.x(l.lap)}
                y={P.t + 9}
                textAnchor="middle"
                className="fill-zinc-500"
                style={{ fontSize: 9 }}
              >
                PIT
              </text>
            </g>
          ))}

        {hover && hovered && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={P.t}
              y2={H - P.b}
              stroke={REFERENCE}
              strokeWidth={1}
            />
            <circle
              cx={hover.x}
              cy={model.y(Math.min(hovered.sec, model.yMax))}
              r={5}
              fill={colorFor(hoveredRow?.slot ?? -1)}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {hover && hovered && (
        <div
          className="pointer-events-none absolute top-[5.5rem] z-10 rounded border border-zinc-700 bg-zinc-900/95 px-2 py-1 text-xs text-zinc-200 shadow-lg"
          style={{
            left: `${Math.min(88, Math.max(12, (hover.x / W) * 100))}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-semibold">{t.rlog.hoverLap(hovered.lap)}</div>
          <div className="text-zinc-400">{hoveredRow?.name ?? t.rlog.unassigned}</div>
          <div className="tabular-nums">{fmtLapSec(hovered.sec)}</div>
          {log.classBestSec != null && (
            <div className="tabular-nums text-zinc-500">
              {fmtGap(hovered.sec - log.classBestSec)} {t.rlog.vsClassBest}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

// ------------------------------------------------------------------- charts

/** Lap times drawn as the gap to the class-best lap (0 = class best). */
function GapBars({
  title,
  note,
  extraNote,
  action,
  rows,
  values,
  absolutes,
  baselineLabels,
}: {
  title: string;
  note?: string;
  /** A second line under the note — what the bars are measured against. */
  extraNote?: string;
  /** Optional control shown next to the title (e.g. a metric switch). */
  action?: React.ReactNode;
  rows: Row[];
  values: (number | null)[];
  absolutes: (number | null)[];
  /** Per row: what its gap is a gap TO. A gap without its yardstick named is
   *  a number nobody can check. */
  baselineLabels?: string[];
}) {
  const t = useT();
  const usable = values.filter((v): v is number => v != null);
  const max = Math.max(0.001, ...usable);
  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold text-zinc-200">
        <span>{title}</span>
        {action}
      </figcaption>
      {note && (
        <p className={`${extraNote ? "mb-1" : "mb-3"} text-xs text-zinc-500`}>{note}</p>
      )}
      {extraNote && <p className="mb-3 text-xs text-cyan-300/80">{extraNote}</p>}
      {usable.length === 0 ? (
        <p className="text-xs text-zinc-500">{t.rlog.noComparable}</p>
      ) : (
        <ul className={note ? "space-y-3" : "mt-3 space-y-3"}>
          {rows.map((r, i) => (
            <li key={r.name}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(r.slot) }}
                  />
                  {r.name}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {fmtLapSec(absolutes[i])}{" "}
                  <span className="text-zinc-500">({fmtGap(values[i])} s)</span>
                </span>
              </div>
              <div className="h-3 w-full rounded-sm bg-zinc-900">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{
                    width:
                      values[i] == null
                        ? "0%"
                        : `${Math.max(2, (values[i]! / max) * 100)}%`,
                    backgroundColor: colorFor(r.slot),
                  }}
                  title={t.rlog.gapTo(
                    r.name,
                    fmtGap(values[i]),
                    baselineLabels?.[i] ?? t.rlog.classBest
                  )}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function CountBars({
  title,
  note,
  rows,
  values,
  labels,
  emptyNote,
}: {
  title: string;
  note?: string;
  rows: Row[];
  /** What the bar LENGTH means — the number the comparison is made on. */
  values: number[];
  /** What to print next to the bar; defaults to the value itself. */
  labels?: string[];
  emptyNote?: string;
}) {
  const max = Math.max(...values, 0);
  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 text-sm font-semibold text-zinc-200">
        {title}
        {note && (
          <span className="mt-1 block text-[11px] font-normal leading-snug text-zinc-500">
            {note}
          </span>
        )}
      </figcaption>
      {max === 0 && emptyNote ? (
        <p className="text-xs text-emerald-300">{emptyNote}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.name}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(r.slot) }}
                  />
                  {r.name}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {labels?.[i] ?? values[i]}
                </span>
              </div>
              <div className="h-3 w-full rounded-sm bg-zinc-900">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{
                    width: `${max > 0 ? Math.max(2, (values[i] / max) * 100) : 2}%`,
                    backgroundColor: colorFor(r.slot),
                  }}
                  title={`${r.name}: ${labels?.[i] ?? values[i]}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Stint-by-stint pace of our car, coloured by the driver who ran it. */
function StintTable({
  log,
  rows,
  stintRow,
  autoStintRow,
  source,
  overrides,
  onStintDriverChange,
}: {
  log: PlannerRaceLog;
  rows: Row[];
  stintRow: number[];
  /** What the automatic sources said, before hand corrections. */
  autoStintRow: number[];
  source: "plan" | "inferred" | "log";
  overrides: (string | null)[];
  onStintDriverChange?: (stintIndex: number, driverName: string | null) => void;
}) {
  const t = useT();
  const stints = log.stints ?? [];
  const paces = stints.map((s) => s.avgSec).filter((n): n is number => n != null);
  const min = paces.length ? Math.min(...paces) : 0;
  const max = paces.length ? Math.max(...paces) : 1;
  const span = Math.max(0.001, max - min);

  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-200">
          {t.rlog.stintTableTitle}
          {log.ownCarNumber ? t.rlog.stintTableCar(log.ownCarNumber) : ""}
          {source !== "log" && (
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-zinc-400">
              {source === "plan"
                ? t.rlog.badgePlanShort
                : t.rlog.badgeReconstructedShort}
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-500">{t.rlog.stintBarNote}</span>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1 pr-2">{t.rlog.colNum}</th>
              <th className="py-1 pr-2">{t.rlog.colLaps}</th>
              <th className="py-1 pr-2">{t.rlog.colDriver}</th>
              <th className="w-1/3 py-1 pr-2">{t.rlog.colStintPace}</th>
              <th className="py-1 pr-2 text-right">{t.rlog.colPit}</th>
            </tr>
          </thead>
          <tbody>
            {stints.map((st, i) => {
              const row = rows[stintRow[i] ?? -1];
              const frac =
                st.avgSec == null ? 0 : 0.25 + 0.75 * (1 - (st.avgSec - min) / span);
              return (
                <tr
                  key={st.index}
                  className="border-t border-zinc-800/60 text-zinc-200"
                >
                  <td className="py-1.5 pr-2">{st.index}</td>
                  <td className="py-1.5 pr-2">
                    {st.laps}
                    <span className="ml-1 text-xs text-zinc-500">
                      ({st.startLap}–{st.endLap})
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor(row?.slot ?? -1) }}
                      />
                      {onStintDriverChange ? (
                        <select
                          value={overrides[i] ?? ""}
                          onChange={(e) =>
                            onStintDriverChange(i, e.target.value || null)
                          }
                          title={t.rlog.stintDriverHint}
                          className={`max-w-[12rem] rounded border bg-transparent px-1 py-0.5 text-sm print:appearance-none print:border-0 ${
                            overrides[i]
                              ? "border-[#ff6b35]/60 text-zinc-100"
                              : "border-transparent text-zinc-200 hover:border-zinc-700"
                          }`}
                        >
                          <option value="">
                            {rows[autoStintRow[i] ?? -1]
                              ? t.rlog.autoDriver(rows[autoStintRow[i]].name)
                              : t.rlog.autoUnknown}
                          </option>
                          {rows.map((r) => (
                            <option key={r.name} value={r.name}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (row?.name ?? "—")
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2">
                      <span className="h-3 flex-1 rounded-sm bg-zinc-900">
                        <span
                          className="block h-3 rounded-r-[4px]"
                          style={{
                            width: `${Math.max(2, frac * 100)}%`,
                            backgroundColor: colorFor(row?.slot ?? -1),
                          }}
                          title={t.rlog.stintPaceHint(st.index, fmtLapSec(st.avgSec))}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-zinc-400">
                        {fmtLapSec(st.avgSec)}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right text-zinc-400">
                    {st.pitSec != null ? `${st.pitSec.toFixed(1)} s` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
