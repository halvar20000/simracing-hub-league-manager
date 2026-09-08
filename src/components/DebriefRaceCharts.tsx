"use client";

import { useState } from "react";
import type {
  DebriefLap,
  DebriefStint,
  DebriefRaceDetail,
} from "@/lib/debrief-stints";
import { fmtLap } from "@/lib/debrief";
import { useT } from "@/components/planner/PlannerUi";
import type { PlannerDict } from "@/lib/i18n/planner";

/**
 * How the race actually ran: the lap trace, the stints, and the plan beside
 * the reality.
 *
 * Colours are the validated categorical slots for a dark surface — the same
 * slot a driver has everywhere else in the de-briefing, so the eye carries
 * one identity from the lap trace to the timeline.
 */

const SERIES = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#9085e9",
] as const;
const GRID = "#27272a";
const REFERENCE = "#a1a1aa";
const UNKNOWN = "#52525b";
const colorFor = (slot: number) =>
  slot < 0 ? UNKNOWN : SERIES[Math.min(slot, SERIES.length - 1)];

const card =
  "rounded-lg border border-zinc-800 bg-zinc-950 p-4 print:border-zinc-300 print:bg-white";
const h2 =
  "mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300 print:text-zinc-900";
const th =
  "border-b border-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400 print:border-zinc-300 print:text-zinc-700";
const td = "px-2 py-1.5 text-zinc-200 print:text-zinc-900";

const fmtDelta = (sec: number | null) =>
  sec == null || !Number.isFinite(sec)
    ? "—"
    : `${sec >= 0 ? "+" : "−"}${Math.abs(sec).toFixed(3).replace(".", ",")}`;

/** 4512 → "1:15:12" — race clock, not a lap time. */
function fmtClock(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec - h * 3600) / 60);
  const s = Math.floor(sec - h * 3600 - m * 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** What kept a lap out of the averages, in the team's words. Keyed the same
 *  way as `LapExclusion`, so an unknown code falls through to itself. */
const reasonText = (t: PlannerDict): Record<string, string> => ({
  form: t.dbfRace.reasonForm,
  start: t.dbfRace.reasonStart,
  in: t.dbfRace.reasonIn,
  out: t.dbfRace.reasonOut,
  fcy: t.dbfRace.reasonFcy,
  restart: t.dbfRace.reasonRestart,
});

export default function DebriefRaceCharts({
  race,
  driverNames,
}: {
  race: DebriefRaceDetail;
  driverNames: string[];
}) {
  const t = useT();
  return (
    <>
      <section className={card}>
        <h2 className={h2}>{t.dbfRace.lapTraceTitle}</h2>
        <LapTrace race={race} driverNames={driverNames} />
      </section>

      {race.timeline && (
        <section className={card}>
          <h2 className={h2}>{t.dbfRace.timelineTitle}</h2>
          <Timeline race={race} />
        </section>
      )}

      {race.stints.length > 0 && (
        <section className={card}>
          <h2 className={h2}>{t.dbfRace.stintByStintTitle}</h2>
          <StintCharts race={race} />
          <StintTable race={race} />
        </section>
      )}
    </>
  );
}

/**
 * Every lap of our car over the race.
 *
 * All laps, not only the clean ones: a de-briefing is about where the race was
 * lost, and the pit stops, the yellows and the one lap somebody spun are
 * exactly that. The excluded laps are drawn hollow and small so they read as
 * context rather than pace, and the y-axis is clipped to a sane band so a
 * single four-minute repair lap cannot flatten the whole trace.
 */
function LapTrace({
  race,
  driverNames,
}: {
  race: DebriefRaceDetail;
  driverNames: string[];
}) {
  const t = useT();
  const [hover, setHover] = useState<DebriefLap | null>(null);
  const laps = race.laps.filter((l) => Number.isFinite(l.sec) && l.sec > 0);
  if (laps.length === 0)
    return <p className="text-sm text-zinc-500">{t.dbfRace.noLapTimes}</p>;

  const clean = laps.filter((l) => l.x == null).map((l) => l.sec);
  const base = clean.length ? clean : laps.map((l) => l.sec);
  const best = Math.min(...base);
  // Show everything up to 25 % off the best lap; anything slower is pinned to
  // the top edge and marked, so a repair stop stays visible without costing
  // the resolution the rest of the race needs.
  const yMax = best * 1.25;
  const yMin = best * 0.995;

  const W = 1000;
  const H = 300;
  const L = 52;
  const R = 10;
  const T = 10;
  const B = 26;
  const lapNos = laps.map((l) => l.lap);
  const minLap = Math.min(...lapNos);
  const maxLap = Math.max(...lapNos);
  const x = (lap: number) =>
    L + ((lap - minLap) / Math.max(1, maxLap - minLap)) * (W - L - R);
  const y = (sec: number) =>
    T + ((Math.min(sec, yMax) - yMin) / (yMax - yMin)) * (H - T - B);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t.dbfRace.lapTraceTitle}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text
              x={L - 6}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="#71717a"
            >
              {fmtLap(t)}
            </text>
          </g>
        ))}
        {race.classBestSec != null && race.classBestSec >= yMin && (
          <line
            x1={L}
            y1={y(race.classBestSec)}
            x2={W - R}
            y2={y(race.classBestSec)}
            stroke={REFERENCE}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        {/* Excluded laps first, so a racing lap is never hidden behind one. */}
        {laps
          .filter((l) => l.x != null)
          .map((l, i) => (
            <circle
              key={`x${i}`}
              cx={x(l.lap)}
              cy={y(l.sec)}
              r={2.5}
              fill="none"
              stroke={colorFor(l.d)}
              strokeWidth={1}
              opacity={0.55}
              onMouseEnter={() => setHover(l)}
            />
          ))}
        {laps
          .filter((l) => l.x == null)
          .map((l, i) => (
            <circle
              key={`c${i}`}
              cx={x(l.lap)}
              cy={y(l.sec)}
              r={2.6}
              fill={colorFor(l.d)}
              onMouseEnter={() => setHover(l)}
            />
          ))}
        {/* Laps slower than the band, pinned to the top edge and marked. */}
        {laps
          .filter((l) => l.sec > yMax)
          .map((l, i) => (
            <path
              key={`o${i}`}
              d={`M${x(l.lap)},${y(yMax) - 5} l4,7 l-8,0 z`}
              fill={colorFor(l.d)}
              onMouseEnter={() => setHover(l)}
            />
          ))}
        <text x={L} y={H - 8} fontSize={10} fill="#71717a">
          Runde {minLap}
        </text>
        <text x={W - R} y={H - 8} fontSize={10} fill="#71717a" textAnchor="end">
          Runde {maxLap}
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 print:text-zinc-600">
        {driverNames.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: colorFor(i) }}
            />
            {n}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-zinc-500" />
          {t.dbfRace.excludedLegend}
        </span>
        {race.classBestSec != null && (
          <span>{t.dbfRace.classBestLegend(fmtLap(race.classBestSec))}</span>
        )}
      </div>
      <p className="mt-1 h-4 text-[11px] text-zinc-400 print:hidden">
        {hover
          ? t.dbfRace.hoverLap(
              hover.lap,
              fmtLap(hover.sec),
              hover.x
                ? t.dbfRace.hoverWhy(reasonText(t)[hover.x] ?? hover.x)
                : "",
              hover.t != null ? t.dbfRace.hoverAt(fmtClock(hover.t)) : ""
            )
          : ""}
      </p>
    </div>
  );
}

/**
 * The stint plan against what the team actually did.
 *
 * Two rows on one race clock: the schedule the plan was signed off with, and
 * the stints the log recorded. The value is the comparison — a stop two laps
 * early, a stint that ran long, a driver change that did not happen — and it
 * is the one picture nothing else in the team can draw, because CLS is the
 * only place that holds both halves.
 */
function Timeline({ race }: { race: DebriefRaceDetail }) {
  const t = useT();
  const [hover, setHover] = useState<string | null>(null);
  const tl = race.timeline;
  if (!tl || tl.spanSec <= 0)
    return <p className="text-sm text-zinc-500">{t.dbfRace.noSessionTimes}</p>;

  const W = 1000;
  const ROW_H = 34;
  const GAP = 16;
  const LABEL = 66; // room for the "Plan" / "Ist" row labels
  const H = 2 * ROW_H + GAP + 34;
  const x = (sec: number) => LABEL + (sec / tl.spanSec) * (W - LABEL - 12);

  // `planned` keeps its own flag rather than being recognised by its label,
  // which is now a translated string.
  const rows: {
    label: string;
    planned: boolean;
    bars: typeof tl.actual;
    y: number;
  }[] = [
    { label: t.dbfRace.rowPlan, planned: true, bars: tl.planned, y: 22 },
    {
      label: t.dbfRace.rowActual,
      planned: false,
      bars: tl.actual,
      y: 22 + ROW_H + GAP,
    },
  ];

  // An hour grid: a three-hour race gets three marks, a twenty-four-hour race
  // does not get twenty-four of them.
  const hours = tl.spanSec / 3600;
  const step = hours <= 4 ? 1800 : hours <= 10 ? 3600 : 7200;
  const marks: number[] = [];
  for (let t = 0; t <= tl.spanSec; t += step) marks.push(t);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t.dbfRace.timelineTitle}
        onMouseLeave={() => setHover(null)}
      >
        {marks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={14} x2={x(t)} y2={H - 20} stroke={GRID} strokeWidth={1} />
            <text x={x(t)} y={H - 6} fontSize={10} fill="#71717a" textAnchor="middle">
              {fmtClock(t)}
            </text>
          </g>
        ))}
        {rows.map((row) => (
          <g key={row.label}>
            <text x={0} y={row.y + 17} fontSize={11} fill="#a1a1aa">
              {row.label}
            </text>
            {row.bars.map((b) => {
              const bw = Math.max(2, x(b.endSec) - x(b.startSec));
              const key = `${row.label}-${b.index}`;
              return (
                <g key={key} onMouseEnter={() => setHover(
                  t.dbfRace.timelineHover(
                    row.label,
                    b.index,
                    b.driver ? t.dbfRace.timelineDriver(b.driver) : "",
                    fmtClock(b.startSec),
                    fmtClock(b.endSec),
                    b.laps ? t.dbfRace.timelineLaps(b.laps) : "",
                    b.pitSec > 0
                      ? t.dbfRace.timelinePit(t.common.dec(b.pitSec, 1))
                      : ""
                  )
                )}>
                  <rect
                    x={x(b.startSec)}
                    y={row.y}
                    width={bw}
                    height={ROW_H - 8}
                    rx={3}
                    fill={colorFor(b.d)}
                    opacity={row.planned ? 0.55 : 1}
                    stroke="#09090b"
                    strokeWidth={2}
                  />
                  {bw > 34 && (
                    <text
                      x={x(b.startSec) + bw / 2}
                      y={row.y + (ROW_H - 8) / 2 + 4}
                      fontSize={10}
                      fill="#09090b"
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {b.index}
                    </text>
                  )}
                  {/* the stop that ends the stint */}
                  {b.pitSec > 0 && (
                    <rect
                      x={x(b.endSec)}
                      y={row.y}
                      width={Math.max(2, x(b.endSec + b.pitSec) - x(b.endSec))}
                      height={ROW_H - 8}
                      fill="#a1a1aa"
                      opacity={row.planned ? 0.4 : 0.75}
                    />
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <p className="mt-1 h-4 text-[11px] text-zinc-400 print:hidden">{hover ?? ""}</p>
      <p className="mt-1 text-[11px] text-zinc-500 print:text-zinc-600">
        {t.dbfRace.timelineNote}
        {tl.actual.length < race.stints.length && (
          <>
            {" "}
            {t.dbfRace.timelineMissing(
              race.stints.length - tl.actual.length,
              race.stints.length
            )}
          </>
        )}
      </p>
    </div>
  );
}

/** Ø lap per stint and the gap to what the plan expected, side by side. */
function StintCharts({ race }: { race: DebriefRaceDetail }) {
  const t = useT();
  const withAvg = race.stints.filter((s) => s.avgSec != null);
  const withDelta = race.stints.filter((s) => s.deltaSec != null);
  if (withAvg.length === 0) return null;

  const W = 1000;
  const H = 150;
  const B = 22;
  const bw = Math.max(6, (W - 20) / Math.max(1, race.stints.length) - 6);
  const bx = (i: number) => 10 + i * ((W - 20) / Math.max(1, race.stints.length));

  const avgs = withAvg.map((s) => s.avgSec as number);
  const lo = Math.min(...avgs);
  const hi = Math.max(...avgs);
  const pad = (hi - lo || 1) * 0.15;
  const yA = (v: number) =>
    H - B - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - B - 10);

  const deltas = withDelta.map((s) => s.deltaSec as number);
  const dMax = deltas.length ? Math.max(...deltas.map((v) => Math.abs(v)), 0.5) : 1;
  const zero = (H - B) / 2 + 4;
  const yD = (v: number) => zero - (v / dMax) * ((H - B) / 2 - 8);

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-400 print:text-zinc-700">
          {t.dbfRace.avgPerStint}
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label={t.dbfRace.avgPerStintAria}>
          <line x1={0} y1={H - B} x2={W} y2={H - B} stroke={GRID} strokeWidth={1} />
          {race.stints.map((s, i) =>
            s.avgSec == null ? null : (
              <g key={s.index}>
                <rect
                  x={bx(i)}
                  y={yA(s.avgSec)}
                  width={bw}
                  height={Math.max(1, H - B - yA(s.avgSec))}
                  rx={2}
                  fill={colorFor(s.d)}
                >
                  <title>
                    {t.dbfRace.avgPerStintHover(
                      s.index,
                      s.driver ? t.dbfRace.timelineDriver(s.driver) : "",
                      fmtLap(s.avgSec)
                    )}
                  </title>
                </rect>
                <text x={bx(i) + bw / 2} y={H - B + 13} fontSize={9}
                      fill="#71717a" textAnchor="middle">
                  {s.index}
                </text>
              </g>
            )
          )}
        </svg>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-400 print:text-zinc-700">
          {t.dbfRace.deltaPerStint}
        </p>
        {withDelta.length === 0 ? (
          <p className="text-xs text-zinc-600">{t.dbfRace.deltaNoDrivers}</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
               aria-label={t.dbfRace.deltaPerStintAria}>
            <line x1={0} y1={zero} x2={W} y2={zero} stroke={GRID} strokeWidth={1} />
            {race.stints.map((s, i) =>
              s.deltaSec == null ? null : (
                <g key={s.index}>
                  <rect
                    x={bx(i)}
                    y={Math.min(zero, yD(s.deltaSec))}
                    width={bw}
                    height={Math.max(1, Math.abs(yD(s.deltaSec) - zero))}
                    rx={2}
                    fill={s.deltaSec > 0 ? "#d95926" : "#199e70"}
                  >
                    <title>
                      {t.dbfRace.deltaHover(s.index, fmtDelta(s.deltaSec))}
                    </title>
                  </rect>
                  <text x={bx(i) + bw / 2} y={H - B + 13} fontSize={9}
                        fill="#71717a" textAnchor="middle">
                    {s.index}
                  </text>
                </g>
              )
            )}
          </svg>
        )}
        <p className="mt-1 text-[11px] text-zinc-500 print:text-zinc-600">
          {t.dbfRace.deltaNote}
        </p>
      </div>
    </div>
  );
}

function StintTable({ race }: { race: DebriefRaceDetail }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr>
            <th className={th}>{t.dbfRace.colStint}</th>
            <th className={th}>{t.dbfRace.colDriver}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colLaps}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colFromTo}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colAvgLap}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colBestLap}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colForecast}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colDelta}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colIncidents}</th>
            <th className={`${th} text-right`}>{t.dbfRace.colPitStop}</th>
          </tr>
        </thead>
        <tbody>
          {race.stints.map((s) => (
            <tr key={s.index} className="border-b border-zinc-900 last:border-0 print:border-zinc-200">
              <td className={td}>{s.index}</td>
              <td className={`${td} whitespace-nowrap`}>
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: colorFor(s.d) }}
                />
                {s.driver ?? "—"}
              </td>
              <td className={`${td} text-right tabular-nums`}>{s.laps}</td>
              <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                {s.startLap ?? "—"}–{s.endLap ?? "—"}
              </td>
              <td className={`${td} text-right tabular-nums`}>{fmtLap(s.avgSec)}</td>
              <td className={`${td} text-right tabular-nums`}>{fmtLap(s.bestSec)}</td>
              <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                {fmtLap(s.planSec)}
              </td>
              <td
                className={`${td} text-right tabular-nums ${
                  s.deltaSec == null
                    ? ""
                    : s.deltaSec > 0
                      ? "text-orange-300 print:text-zinc-900"
                      : "text-emerald-300 print:text-zinc-900"
                }`}
              >
                {fmtDelta(s.deltaSec)}
              </td>
              <td className={`${td} text-right tabular-nums`}>
                {race.incidentsTimed ? (s.incidents ?? 0) : "—"}
              </td>
              <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                {s.pitSec == null ? "—" : `${t.common.dec(s.pitSec, 1)} s`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!race.incidentsTimed && (
        <p className="mt-2 text-[11px] text-zinc-500 print:text-zinc-600">
          {t.dbfRace.incidentsNotTimed}
        </p>
      )}
    </div>
  );
}
