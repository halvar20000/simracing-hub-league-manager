"use client";

import { useMemo, useState } from "react";
import type {
  LapExclusion,
  PlannerRaceLog,
  TeamDriverStat,
} from "@/lib/stint-plan-state";
import { targetLapSec, fmtPaceSec, type PacePoint } from "@/lib/pace-reference";
import {
  attributeByPlan,
  attributeStints,
  cleanLapStats,
  describeExclusions,
  type PlanStintWindow,
} from "@/lib/race-log-attribution";

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

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

/** One driver row on the dashboard: hard numbers + reconstructed ones. */
type Row = {
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
  /** How many laps that mean is built on, and how many were dropped. */
  cleanLaps: number;
  cleanDropped: number;
  /** Why they were dropped, when the trace is marked (parser gen 2+). */
  cleanByReason: Partial<Record<LapExclusion, number>>;
  /** The rating this driver started the race with, from the results file. */
  iRating: number | null;
};

const normName = (s: string) => s.trim().toLowerCase();

export default function RaceLogDashboard({
  log,
  teamDrivers,
  planStints,
  official = false,
  paceCurve = null,
  refLapSec = null,
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
}) {
  const laps = useMemo(() => log.laps ?? [], [log.laps]);
  const logDrivers = useMemo(() => log.drivers ?? [], [log.drivers]);
  const stints = useMemo(() => log.stints ?? [], [log.stints]);
  /** Which average the gap chart shows: the clean one by default. */
  const [cleanAvg, setCleanAvg] = useState(true);
  /** Did the parser mark WHY each lap is out? Logs uploaded before that only
   *  support the in/out fallback and can be brought up to date by re-analysing. */
  const marked = (log.exclV ?? 1) >= 2;

  const model = useMemo(() => {
    const team = teamDrivers ?? [];
    const plan = planStints ?? [];
    const planNames: string[] = [];
    for (const p of plan) {
      if (p.driverName && !planNames.some((n) => normName(n) === normName(p.driverName!)))
        planNames.push(p.driverName);
    }

    // Who the dashboard has a row for: the event result's line-up (it carries
    // iRacing's own numbers), plus anyone the plan lists who isn't in it.
    const names: { name: string; stat?: TeamDriverStat }[] = team.map((d) => ({
      name: d.name,
      stat: d,
    }));
    for (const n of planNames) {
      if (!names.some((r) => normName(r.name) === normName(n))) names.push({ name: n });
    }
    const rowIndexOf = (name: string) =>
      names.findIndex((r) => normName(r.name) === normName(name));

    // --- solo race with neither a plan line-up nor an event result --------
    if (names.length === 0) {
      return {
        rows: logDrivers.map<Row>((d, di) => {
          const clean = cleanLapStats(
            laps,
            laps.map((_, li) => li).filter((li) => laps[li].d === di),
            marked
          );
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
            // The log has no ratings — only the results file does.
            iRating: null,
            cleanSec: clean.avg,
            cleanLaps: clean.laps,
            cleanDropped: clean.dropped,
            cleanByReason: clean.byReason,
          };
        }),
        lapRow: laps.map((l) => l.d),
        stintRow: stints.map((s) => s.d),
        source: "log" as const,
        confident: true,
      };
    }

    // --- who drove which stint -------------------------------------------
    // 1. the plan's own driver order, matched to the real stints by time —
    //    this is a fact the team typed in, not a guess;
    // 2. otherwise reconstruct from the event result's fastest-lap anchors.
    const planAtt = attributeByPlan(stints, plan, rowIndexOf);
    const att = planAtt ?? attributeStints(stints, team);
    const source: "plan" | "inferred" | "log" = planAtt
      ? "plan"
      : att
        ? "inferred"
        : "log";
    const stintRow = att ? att.byStint : stints.map(() => -1);
    // lap → row index: the first stint that has not ended yet. A lap inside a
    // stint maps to that stint; a lap in the gap between two stints is the
    // out-lap of the driver taking over, so it maps to the following stint;
    // anything past the last stint stays with the last driver.
    const lapRow = laps.map((l) => {
      const si = stints.findIndex((s) => s.endLap != null && l.lap <= s.endLap);
      return si >= 0 ? stintRow[si] : stintRow[stintRow.length - 1] ?? -1;
    });

    const rows = names.map<Row>(({ name, stat }, i) => {
      const mineIdx = laps.map((_, li) => li).filter((li) => lapRow[li] === i);
      const mine = mineIdx.map((li) => laps[li].sec);
      const best = mine.length ? Math.min(...mine) : null;
      const green = best ? mine.filter((s) => s <= best * 1.05) : [];
      const p90 = percentile(green, 0.9);
      const clean = cleanLapStats(laps, mineIdx, marked);
      return {
        cleanSec: clean.avg,
        cleanLaps: clean.laps,
        cleanDropped: clean.dropped,
        cleanByReason: clean.byReason,
        name,
        slot: i,
        // iRacing's numbers when we have them; otherwise what the log shows
        // for the laps attributed to this driver.
        laps: stat?.laps ?? (mine.length || null),
        bestSec: stat?.bestSec ?? best,
        avgSec:
          stat?.avgSec ??
          (mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : null),
        incidents: stat?.incidents ?? null,
        iRating: stat?.iRating ?? null,
        greenSec: median(green),
        spreadSec: p90 != null && best != null ? p90 - best : null,
        stints: stintRow.filter((r) => r === i).length,
      };
    });

    return {
      rows,
      lapRow,
      stintRow,
      source,
      confident: att?.confident ?? false,
    };
  }, [teamDrivers, planStints, logDrivers, laps, stints, marked]);

  const { rows, lapRow, stintRow, source, confident } = model;
  const inferred = source === "inferred";
  const fromPlan = source === "plan";

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No lap data for our car in this log.</p>
    );
  }

  // The clean average is the better number, so it leads — but iRacing's own
  // average stays one click away, because that is what the results page shows
  // and someone will always want to reconcile the two.
  const haveClean = rows.some((r) => r.cleanSec != null);
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
  const droppedNote = describeExclusions(droppedByReason);

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
      return `target for ${rows[i].iRating} iR (${fmtPaceSec(targets[i])})`;
    }
    if (official && refLapSec != null) return `10k reference (${fmtPaceSec(refLapSec)})`;
    return `class best (${fmtPaceSec(classReference)})`;
  };
  const reference = classReference;

  return (
    <div className="space-y-5">
      {(fromPlan || inferred) && (
        <p className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300">Team event.</span> Laps,
          best lap, average lap and incidents come from the{" "}
          <span className="font-mono">eventresult.json</span> — iRacing&apos;s own
          per-driver scoring. The race logger records only one driver name per
          car, so who drove which stint comes from{" "}
          {fromPlan ? (
            <>
              <span className="font-semibold text-zinc-300">
                your stint schedule above
              </span>{" "}
              — each real stint is matched to the planned stint it overlaps in
              time, live ± corrections included.
            </>
          ) : (
            <>
              a <em>reconstruction</em> from each driver&apos;s fastest-lap number
              and lap count. Assign the drivers in the stint schedule above and
              this becomes exact.
            </>
          )}
          {inferred && !confident && (
            <span className="ml-1 text-amber-300">
              The reconstruction did not match every driver&apos;s lap count
              exactly — treat the stint assignment as a best guess.
            </span>
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
            <div className="text-xs text-zinc-500">best lap</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt className="text-zinc-500">Laps</dt>
              <dd className="text-right text-zinc-200">{d.laps ?? "—"}</dd>
              <dt className="text-zinc-500">Average</dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.avgSec)}</dd>
              <dt
                className="text-zinc-500"
                title="Average over this driver's racing laps only — the lap into the pits and the lap back out are left out, so a double stint and a repair stop no longer make a driver look slow."
              >
                Ø clean{source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd
                className="text-right text-zinc-200"
                title={
                  d.cleanLaps
                    ? `${d.cleanLaps} racing laps, ${d.cleanDropped} ignored${
                        describeExclusions(d.cleanByReason)
                          ? ` (${describeExclusions(d.cleanByReason)})`
                          : ""
                      }`
                    : "No racing laps left after removing the in/out laps"
                }
              >
                {fmtLapSec(d.cleanSec)}
              </dd>
              <dt className="text-zinc-500">Incidents</dt>
              <dd
                className={`text-right ${
                  (d.incidents ?? 0) > 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {d.incidents ?? "—"}
              </dd>
              <dt className="text-zinc-500">
                Green pace{source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.greenSec)}</dd>
              {official && targets[di] != null && (
                <>
                  <dt className="text-zinc-500" title={`Read off the pace curve at this driver's own ${d.iRating} iRating.`}>
                    Target ({d.iRating} iR)
                  </dt>
                  <dd className="text-right text-cyan-300">
                    {fmtPaceSec(targets[di])}
                  </dd>
                </>
              )}
              <dt className="text-zinc-500">
                Spread{source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">
                {d.spreadSec == null ? "—" : `${d.spreadSec.toFixed(3)} s`}
              </dd>
              <dt className="text-zinc-500">
                Stints{source !== "log" && <sup className="text-zinc-600">*</sup>}
              </dt>
              <dd className="text-right text-zinc-200">{d.stints}</dd>
            </dl>
          </div>
        ))}
      </div>
      {source !== "log" && (
        <p className="-mt-3 text-[11px] text-zinc-600">
          {fromPlan
            ? "* measured from the log, split by the driver order in your stint schedule."
            : "* derived from the reconstructed stint split."}
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
          title="Best lap — gap to class best"
          rows={rows}
          values={rows.map((r) =>
            r.bestSec != null && reference != null ? r.bestSec - reference : null
          )}
          absolutes={rows.map((r) => r.bestSec)}
        />
        <GapBars
          title={
            official && haveTargets
              ? "Average lap — gap to your own iRating's target"
              : official && refLapSec != null
                ? "Average lap — gap to the 10k reference"
                : "Average lap — gap to class best"
          }
          note={
            cleanAvg
              ? marked
                ? `Average over racing laps only — the formation and start laps, the lap into the pits and the lap back out, every lap under a full-course yellow and the restart lap after it are all left out${
                    droppedTotal > 0
                      ? ` (${droppedTotal} laps${droppedNote ? `: ${droppedNote}` : ""})`
                      : ""
                  }. A local waved yellow is not a caution and does not remove a lap.`
                : `Average over racing laps: the lap into the pits and the lap back out are ignored${
                    droppedTotal > 0 ? ` (${droppedTotal} laps)` : ""
                  }. This log was analysed before the formation, start and full-course-yellow laps were recognised — press Re-analyse above to apply those too.`
              : "iRacing's average over every lap the driver completed, so pit, caution and repair laps are in it."
          }
          action={
            haveClean && (
              <button
                type="button"
                onClick={() => setCleanAvg((v) => !v)}
                className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                title="Switch between the clean average (in/out laps removed) and iRacing's own average."
              >
                {cleanAvg ? "Ø clean" : "iRacing Ø"}
              </button>
            )
          }
          rows={rows}
          values={rows.map((r, i) => {
            const v = cleanAvg ? (r.cleanSec ?? r.avgSec) : r.avgSec;
            const base = baselineOf(i);
            return v != null && base != null ? v - base : null;
          })}
          absolutes={rows.map((r) => (cleanAvg ? (r.cleanSec ?? r.avgSec) : r.avgSec))}
          baselineLabels={rows.map((_, i) => baselineLabelOf(i))}
          extraNote={
            official
              ? haveTargets
                ? `Each bar is that driver's own yardstick: the lap his iRating was worth here, read off the pace curve. A short bar means he drove above his rating${
                    refLapSec != null
                      ? `; the fixed 10k reference for this track is ${fmtPaceSec(refLapSec)}`
                      : ""
                  }.`
                : paceCurve && paceCurve.length > 0
                  ? "No iRatings in the results file yet — upload the eventresult.json and every driver gets his own target. Until then the fixed reference (or the class best) is used for everyone."
                  : "No pace curve chosen for this plan, so everyone is measured against the same number. Pick one in the Event card to get per-driver targets."
              : undefined
          }
        />
        <CountBars
          title="Laps driven"
          rows={rows}
          values={rows.map((r) => r.laps ?? 0)}
        />
        <CountBars
          title="Incidents per stint"
          note="Bar length is incidents ÷ stints. Comparing raw totals punishes whoever was in the car longest — a driver with four stints and 4x is as clean as one with two stints and 2x."
          rows={rows}
          values={rows.map((r) =>
            r.stints > 0 ? (r.incidents ?? 0) / r.stints : (r.incidents ?? 0)
          )}
          labels={rows.map((r) => {
            const inc = r.incidents ?? 0;
            if (r.stints <= 0) return `${inc}x — stints unknown`;
            const rate = inc / r.stints;
            return `${rate.toFixed(1)}/stint — ${inc}x in ${r.stints} stint${
              r.stints === 1 ? "" : "s"
            }`;
          })}
          emptyNote="No incidents — clean race."
        />
      </div>

      {stints.length > 0 && (
        <StintTable log={log} rows={rows} stintRow={stintRow} source={source} />
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
          Lap times over the race
          {source !== "log" && (
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-zinc-400">
              {source === "plan"
                ? "drivers from the stint plan"
                : "stint split reconstructed"}
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-500">
          {model.above > 0
            ? `${model.above} lap${model.above === 1 ? "" : "s"} above the scale (pit / caution)`
            : "all laps in scale"}
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
            class best{log.ownCarClass ? ` (${log.ownCarClass})` : ""}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Lap time per lap for each team driver"
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
          <div className="font-semibold">Lap {hovered.lap}</div>
          <div className="text-zinc-400">{hoveredRow?.name ?? "unassigned"}</div>
          <div className="tabular-nums">{fmtLapSec(hovered.sec)}</div>
          {log.classBestSec != null && (
            <div className="tabular-nums text-zinc-500">
              {fmtGap(hovered.sec - log.classBestSec)} vs class best
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
        <p className="text-xs text-zinc-500">No comparable lap times.</p>
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
                  title={`${r.name}: ${fmtGap(values[i])} s off ${
                    baselineLabels?.[i] ?? "class best"
                  }`}
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
  source,
}: {
  log: PlannerRaceLog;
  rows: Row[];
  stintRow: number[];
  source: "plan" | "inferred" | "log";
}) {
  const stints = log.stints ?? [];
  const paces = stints.map((s) => s.avgSec).filter((n): n is number => n != null);
  const min = paces.length ? Math.min(...paces) : 0;
  const max = paces.length ? Math.max(...paces) : 1;
  const span = Math.max(0.001, max - min);

  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-200">
          Stint by stint{log.ownCarNumber ? ` — car #${log.ownCarNumber}` : ""}
          {source !== "log" && (
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-zinc-400">
              {source === "plan" ? "drivers from the plan" : "driver reconstructed"}
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-500">
          bar length = stint pace relative to our best and worst stint
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Laps</th>
              <th className="py-1 pr-2">Driver</th>
              <th className="w-1/3 py-1 pr-2">Stint pace</th>
              <th className="py-1 pr-2 text-right">Pit</th>
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
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: colorFor(row?.slot ?? -1) }}
                      />
                      {row?.name ?? "—"}
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
                          title={`Stint ${st.index}: ${fmtLapSec(st.avgSec)}`}
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
