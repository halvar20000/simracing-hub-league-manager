"use client";

import type { FieldBench } from "@/lib/debrief-field";
import { fmtLap } from "@/lib/debrief";
import { useT } from "@/components/planner/PlannerUi";
import type { PlannerDict } from "@/lib/i18n/planner";

/**
 * "Waren wir langsam, oder waren alle langsam?"
 *
 * The class we raced in, out of the same log the rest of the de-briefing runs
 * on. Our own car is the only one drawn as a line — the class is a reference,
 * not a competitor ranking, and a chart with sixteen lines answers nothing.
 *
 * Team-internal by design: this sits inside a de-briefing, which is as private
 * as the stint plan it belongs to.
 */

const OWN = "#3987e5";
const REFERENCE = "#a1a1aa";
const GRID = "#27272a";
const CAUTION = "#c98500";

const card =
  "rounded-lg border border-zinc-800 bg-zinc-950 p-4 print:border-zinc-300 print:bg-white";
const h2 =
  "mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300 print:text-zinc-900";
const th =
  "border-b border-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400 print:border-zinc-300 print:text-zinc-700";
const td = "px-2 py-1.5 text-zinc-200 print:text-zinc-900";

const makeFmt = (t: PlannerDict) => ({
  delta: (sec: number | null) =>
    sec == null || !Number.isFinite(sec)
      ? "—"
      : `${sec >= 0 ? "+" : "−"}${t.common.dec(Math.abs(sec), 2)}`,
  sec: (sec: number | null, digits = 1) =>
    sec == null || !Number.isFinite(sec) ? "—" : `${t.common.dec(sec, digits)} s`,
});

export default function DebriefFieldBox({ field }: { field: FieldBench }) {
  const t = useT();
  const fmt = makeFmt(t);
  const own = field.own;
  return (
    <section className={card}>
      <h2 className={h2}>
        {t.dbfField.boxTitle(field.className ?? t.dbfField.classFallback)}
      </h2>

      <p className="mb-3 text-sm text-zinc-300 print:text-zinc-800">
        {own?.cleanSec != null && field.classCleanSec != null ? (
          <>
            {t.dbfField.medianPre}{" "}
            <span className="font-semibold text-zinc-100 print:text-zinc-900">
              {fmtLap(own.cleanSec)}
            </span>
            {t.dbfField.medianMid(fmtLap(field.classCleanSec))}{" "}
            <span
              style={{
                color:
                  (own.deltaSec ?? 0) <= 0 ? "#199e70" : "#d95926",
              }}
            >
              {fmt.delta(own.deltaSec)} s
            </span>
            {field.paceRank != null && (
              <>{t.dbfField.rank(field.paceRank, field.paceRanked)}</>
            )}
            .
          </>
        ) : (
          <>{t.dbfField.tooFewLaps}</>
        )}
      </p>

      {field.windows.length > 1 && <WindowChart field={field} />}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>{t.dbfField.colNum}</th>
              <th className={th}>{t.dbfField.colTeam}</th>
              <th className={`${th} text-right`}>{t.dbfField.colMedian}</th>
              <th className={`${th} text-right`}>{t.dbfField.colDeltaClass}</th>
              <th className={`${th} text-right`}>{t.dbfField.colBest}</th>
              <th className={`${th} text-right`}>{t.dbfField.colSpread}</th>
              <th className={`${th} text-right`}>{t.dbfField.colStops}</th>
              <th className={`${th} text-right`}>{t.dbfField.colAvgStop}</th>
              <th className={`${th} text-right`}>{t.dbfField.colLaps}</th>
              <th className={`${th} text-right`}>{t.dbfField.colPos}</th>
            </tr>
          </thead>
          <tbody>
            {field.rows.map((r) => (
              <tr
                key={`${r.carNumber}-${r.team}`}
                className={
                  r.own
                    ? "bg-zinc-900/70 font-semibold print:bg-zinc-100"
                    : undefined
                }
              >
                <td className={`${td} tabular-nums`}>{r.carNumber ?? "—"}</td>
                <td className={td}>{r.team ?? "—"}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {r.cleanSec == null ? "—" : fmtLap(r.cleanSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {fmt.delta(r.deltaSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {r.bestSec == null ? "—" : fmtLap(r.bestSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {fmt.sec(r.spreadSec, 2)}
                </td>
                <td className={`${td} text-right tabular-nums`}>{r.stops}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {fmt.sec(r.pitMedianSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {r.laps ?? "—"}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {r.classPos == null ? "—" : r.classPos + 1}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 print:text-zinc-600">
        {t.dbfField.methodNote} {t.dbfField.methodStops}{" "}
        <span className="text-zinc-600 print:text-zinc-700">
          {t.dbfField.perCarNote}
        </span>
        {field.cautionBands.length > 0 && t.dbfField.cautionNote}
        {field.shared && t.dbfField.sharedNote}
      </p>
    </section>
  );
}

/**
 * Our median lap against the class median, ten minutes at a time.
 *
 * One window is roughly five laps, so the line follows fuel load, track
 * evolution and the traffic we happened to be in — the things that make a raw
 * "we were 0,3 s off" misleading. Full-course yellows are banded rather than
 * removed: the laps inside them are already out of both medians, and seeing
 * the gap is the point.
 */
function WindowChart({ field }: { field: FieldBench }) {
  const t = useT();
  const pts = field.windows;
  const vals = pts.flatMap((p) =>
    [p.own, p.cls].filter((x): x is number => x != null)
  );
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(0.3, (hi - lo) * 0.15);
  const yMin = lo - pad;
  const yMax = hi + pad;

  const W = 1000;
  const H = 210;
  const L = 58;
  const R = 10;
  const T = 10;
  const B = 24;
  const minX = pts[0].min;
  const maxX = pts[pts.length - 1].min;
  const x = (m: number) =>
    L + ((m - minX) / Math.max(1, maxX - minX)) * (W - L - R);
  const y = (s: number) => T + ((s - yMin) / (yMax - yMin)) * (H - T - B);

  const path = (key: "own" | "cls") => {
    let d = "";
    let open = false;
    for (const p of pts) {
      const v = p[key];
      if (v == null) {
        open = false;
        continue;
      }
      d += `${open ? "L" : "M"}${x(p.min).toFixed(1)},${y(v).toFixed(1)} `;
      open = true;
    }
    return d.trim();
  };

  const ticks = [0, 0.5, 1].map((f) => yMin + f * (yMax - yMin));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t.dbfField.windowAria}
      >
        {field.cautionBands.map((b, i) => (
          <rect
            key={i}
            x={x(Math.max(minX, b.from))}
            y={T}
            width={Math.max(2, x(Math.min(maxX, b.to)) - x(Math.max(minX, b.from)))}
            height={H - T - B}
            fill={CAUTION}
            opacity={0.12}
          />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#71717a">
              {fmtLap(t)}
            </text>
          </g>
        ))}
        <path d={path("cls")} fill="none" stroke={REFERENCE} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path("own")} fill="none" stroke={OWN} strokeWidth={2} />
        {pts.map((p, i) =>
          p.own == null ? null : (
            <circle key={i} cx={x(p.min)} cy={y(p.own)} r={2.6} fill={OWN} />
          )
        )}
        <text x={L} y={H - 6} fontSize={10} fill="#71717a">
          {t.dbfField.minutes(minX)}
        </text>
        <text x={W - R} y={H - 6} fontSize={10} fill="#71717a" textAnchor="end">
          {t.dbfField.minutes(maxX)}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 print:text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: OWN }} />
          {t.dbfField.ourCar}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${REFERENCE} 0 5px, transparent 5px 9px)`,
            }}
          />
          {t.dbfField.classMedian}
        </span>
        {field.cautionBands.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ background: CAUTION, opacity: 0.35 }}
            />
            {t.dbfField.caution}
          </span>
        )}
      </div>
    </div>
  );
}
