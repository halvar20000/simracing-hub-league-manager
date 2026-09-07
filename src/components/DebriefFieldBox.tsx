"use client";

import type { FieldBench } from "@/lib/debrief-field";
import { fmtLap } from "@/lib/debrief";

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

const fmtDelta = (sec: number | null) =>
  sec == null || !Number.isFinite(sec)
    ? "—"
    : `${sec >= 0 ? "+" : "−"}${Math.abs(sec).toFixed(2).replace(".", ",")}`;

const fmtSec = (sec: number | null, digits = 1) =>
  sec == null || !Number.isFinite(sec)
    ? "—"
    : `${sec.toFixed(digits).replace(".", ",")} s`;

export default function DebriefFieldBox({ field }: { field: FieldBench }) {
  const own = field.own;
  return (
    <section className={card}>
      <h2 className={h2}>Klassenumfeld — {field.className ?? "Klasse"}</h2>

      <p className="mb-3 text-sm text-zinc-300 print:text-zinc-800">
        {own?.cleanSec != null && field.classCleanSec != null ? (
          <>
            Unser Median lag bei{" "}
            <span className="font-semibold text-zinc-100 print:text-zinc-900">
              {fmtLap(own.cleanSec)}
            </span>
            , der Klassenmedian bei {fmtLap(field.classCleanSec)} —{" "}
            <span
              style={{
                color:
                  (own.deltaSec ?? 0) <= 0 ? "#199e70" : "#d95926",
              }}
            >
              {fmtDelta(own.deltaSec)} s
            </span>
            {field.paceRank != null && (
              <>
                , Platz {field.paceRank} von {field.paceRanked} in der Klasse
                nach Pace
              </>
            )}
            .
          </>
        ) : (
          <>
            Für unser Auto hat das Log zu wenige saubere Runden erfasst, um eine
            Median-Pace zu bilden.
          </>
        )}
      </p>

      {field.windows.length > 1 && <WindowChart field={field} />}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Team</th>
              <th className={`${th} text-right`}>Median</th>
              <th className={`${th} text-right`}>Δ Klasse</th>
              <th className={`${th} text-right`}>Beste</th>
              <th className={`${th} text-right`}>Streuung</th>
              <th className={`${th} text-right`}>Stopps</th>
              <th className={`${th} text-right`}>Ø Stopp</th>
              <th className={`${th} text-right`}>Runden</th>
              <th className={`${th} text-right`}>Pos.</th>
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
                  {fmtDelta(r.deltaSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {r.bestSec == null ? "—" : fmtLap(r.bestSec)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {fmtSec(r.spreadSec, 2)}
                </td>
                <td className={`${td} text-right tabular-nums`}>{r.stops}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {fmtSec(r.pitMedianSec)}
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
        Median der Rennrunden — Einführungs- und Startrunde, Ein- und
        Ausfahrtsrunden, Gelbphasen und Restarts sind nach denselben Regeln
        ausgeschlossen wie bei uns. Streuung ist p90 minus Median, also
        unempfindlich gegen die eine Runde im Kiesbett. Stopps zählen erst ab 20
        Sekunden Standzeit, kürzere Boxendurchfahrten bleiben draußen.{" "}
        <span className="text-zinc-600 print:text-zinc-700">
          Die Zahlen gelten je Auto, nicht je Fahrer: der Logger schreibt für
          jedes fremde Auto nur den Namen, der beim Session-Start darin saß.
        </span>
        {field.cautionBands.length > 0 &&
          " Im gelben Band steht bewusst die tatsächlich gefahrene Pace: das Feld wird schon langsamer, bevor Race Control die Flagge wirft, und diese Runden gehören zum Rennen."}
        {field.shared && " Der Parse stammt aus dem Upload eines anderen Teams zum selben Rennen."}
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
        aria-label="Median je Zehn-Minuten-Fenster, unser Auto gegen die Klasse"
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
          {minX} min
        </text>
        <text x={W - R} y={H - 6} fontSize={10} fill="#71717a" textAnchor="end">
          {maxX} min
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 print:text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: OWN }} />
          unser Auto
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${REFERENCE} 0 5px, transparent 5px 9px)`,
            }}
          />
          Klassenmedian
        </span>
        {field.cautionBands.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ background: CAUTION, opacity: 0.35 }}
            />
            Gelbphase
          </span>
        )}
      </div>
    </div>
  );
}
