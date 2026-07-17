"use client";

// Compact driver-performance dashboard for the stint planner, built from a
// Garage 61 pull/import (per-driver clean-lap stats + the temperature fit).
// Hand-rolled SVG (no chart dependency) so it matches the app and prints.

import type { ReactNode } from "react";
import type { G61ImportResult } from "@/lib/garage61-import";
import { fmtLap } from "@/lib/stint-planner";

const COLORS = [
  "#ff6b35",
  "#38bdf8",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#facc15",
  "#fb7185",
  "#22d3ee",
  "#4ade80",
  "#e879f9",
];

const med = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtGap = (s: number): string => (s <= 0.001 ? "—" : `+${s.toFixed(2)}`);
const th = "py-1 pr-2 text-right font-normal";
const td = "py-1 pr-2 text-right";

const nameKey = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const matchesRoster = (name: string, roster: string[]): boolean => {
  if (roster.length === 0) return true;
  const a = nameKey(name);
  return roster.some((r) => {
    const b = nameKey(r);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  });
};

export default function StintDriverStats({
  analysis,
  rosterNames = [],
}: {
  analysis: G61ImportResult;
  rosterNames?: string[];
}) {
  // Filter to the plan roster at render time too, so a stale saved analysis
  // (pulled before the driver was removed) can't show non-roster drivers.
  const roster = rosterNames.filter((n) => n.trim() !== "");
  const drivers = [...analysis.drivers]
    .filter((d) => matchesRoster(d.driver, roster))
    .sort((a, b) => a.racePaceSec - b.racePaceSec);
  const wetDrivers = (analysis.wet?.drivers ?? []).filter((d) =>
    matchesRoster(d.driver, roster)
  );
  if (drivers.length === 0) return null;
  const color = (i: number) => COLORS[i % COLORS.length];
  const fastest = drivers[0].racePaceSec;
  const bestFuel = Math.min(...drivers.map((d) => d.fuelPerLap));
  const mostConsistent = Math.min(...drivers.map((d) => d.stdSec));

  // ---- Pace & consistency box/whisker ----
  const lo0 = Math.min(...drivers.map((d) => d.minSec));
  const hi0 = Math.max(...drivers.map((d) => d.maxSec));
  const pad = (hi0 - lo0) * 0.06 || 0.5;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const B = { labelW: 118, right: 512, top: 8, rowH: 26 };
  const bx = (s: number) =>
    B.labelW + ((B.right - B.labelW) * (s - lo)) / (hi - lo || 1);
  const boxH = B.top + drivers.length * B.rowH + 28;
  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => lo + ((hi - lo) * i) / ticks
  );

  // ---- Fuel per lap bars ----
  const fMax = Math.max(...drivers.map((d) => d.fuelPerLap)) * 1.12 || 1;
  const F = { labelW: 118, right: 512, top: 6, rowH: 22 };
  const fx = (v: number) => F.labelW + ((F.right - F.labelW) * v) / fMax;
  const fuelH = F.top + drivers.length * F.rowH + 6;

  // ---- Lap time vs track temp scatter (deviation from each driver's median) ----
  const rawMed = drivers.map((d) => med(d.points.map((p) => p.y)));
  const sc = drivers.flatMap((d, i) =>
    d.points
      .filter((p) => p.t != null)
      .map((p) => ({ x: p.t as number, dev: p.y - rawMed[i], ci: i }))
  );
  const S = { l: 44, r: 12, t: 10, b: 26, w: 520, h: 210 };
  let scatter: ReactNode = null;
  if (sc.length >= 3) {
    const xs = sc.map((p) => p.x);
    const ys = sc.map((p) => p.dev);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const xPad = (xMax - xMin) * 0.08 || 1;
    const yAbs = Math.max(1, ...ys.map((v) => Math.abs(v)));
    const xlo = xMin - xPad;
    const xhi = xMax + xPad;
    const sx = (x: number) =>
      S.l + ((S.w - S.l - S.r) * (x - xlo)) / (xhi - xlo || 1);
    const sy = (v: number) =>
      S.t + ((S.h - S.t - S.b) * (yAbs - v)) / (2 * yAbs || 1);
    const slope = analysis.temp.slopePerC;
    const src = analysis.temp.sourceTempC;
    const line =
      slope != null && src != null
        ? { x1: xlo, y1: slope * (xlo - src), x2: xhi, y2: slope * (xhi - src) }
        : null;
    scatter = (
      <svg viewBox={`0 0 ${S.w} ${S.h}`} className="w-full" role="img">
        {/* zero line */}
        <line x1={S.l} y1={sy(0)} x2={S.w - S.r} y2={sy(0)} stroke="#3f3f46" strokeWidth={1} />
        {/* y labels */}
        <text x={4} y={sy(yAbs) + 3} fontSize={9} fill="#71717a">+{yAbs.toFixed(1)}s</text>
        <text x={4} y={sy(0) + 3} fontSize={9} fill="#71717a">0</text>
        <text x={4} y={sy(-yAbs) + 3} fontSize={9} fill="#71717a">-{yAbs.toFixed(1)}s</text>
        {/* x labels */}
        <text x={S.l} y={S.h - 8} fontSize={9} fill="#71717a">{xlo.toFixed(0)}°C</text>
        <text x={S.w - S.r} y={S.h - 8} fontSize={9} fill="#71717a" textAnchor="end">{xhi.toFixed(0)}°C</text>
        {line && (
          <line
            x1={sx(line.x1)} y1={sy(line.y1)} x2={sx(line.x2)} y2={sy(line.y2)}
            stroke="#e4e4e7" strokeWidth={1.5} strokeDasharray="4 3"
          />
        )}
        {sc.map((p, k) => (
          <circle key={k} cx={sx(p.x)} cy={sy(p.dev)} r={2.6} fill={color(p.ci)} fillOpacity={0.85} />
        ))}
      </svg>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
          Driver performance
        </h2>
        <span className="text-[11px] text-zinc-500">
          {analysis.overall.cleanLaps} clean laps
          {analysis.temp.sourceTempC != null
            ? ` · ~${Math.round(analysis.temp.sourceTempC)}°C`
            : ""}
          {analysis.temp.slopePerC != null
            ? ` · ${(analysis.temp.slopePerC * 10).toFixed(1)} s/10°C fit`
            : ""}
        </span>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {drivers.map((d, i) => (
          <span key={d.driver} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color(i) }} />
            {d.driver}
          </span>
        ))}
      </div>

      {/* Stats table */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1 pr-2 font-normal">Driver</th>
              <th className={th}>Laps</th>
              <th className={th}>Best</th>
              <th className={th}>Median</th>
              <th className={th}>Δ fastest</th>
              <th className={th}>Consistency (σ)</th>
              <th className={th}>Fuel/lap</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr key={d.driver} className="border-t border-zinc-800/60 text-zinc-200">
                <td className="py-1 pr-2">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color(i) }} />
                  {d.driver}
                </td>
                <td className={td}>{d.laps}</td>
                <td className={td}>{fmtLap(d.bestSec)}</td>
                <td className={td}>{fmtLap(d.racePaceSec)}</td>
                <td className={`${td} ${i === 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                  {i === 0 ? "fastest" : fmtGap(d.racePaceSec - fastest)}
                </td>
                <td className={`${td} ${d.stdSec === mostConsistent ? "text-emerald-400" : ""}`}>
                  ±{d.stdSec.toFixed(2)}s
                </td>
                <td className={`${td} ${d.fuelPerLap === bestFuel ? "text-emerald-400" : ""}`}>
                  {d.fuelPerLap.toFixed(2)} L
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wet-weather summary (from the rain laps) */}
      {analysis.wet && wetDrivers.length > 0 && (
        <div className="mb-4 rounded border border-sky-900/50 bg-sky-950/20 p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-sky-300">
              Wet weather
            </h3>
            <span className="text-[11px] text-zinc-400">
              {analysis.wet.laps} wet laps ·{" "}
              {Math.round(analysis.wet.minWetness)}–
              {Math.round(analysis.wet.maxWetness)}% wet
              {analysis.wet.deltaSec != null
                ? ` · +${analysis.wet.deltaSec.toFixed(1)}s/lap vs dry`
                : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2 font-normal">Driver</th>
                  <th className={th}>Wet laps</th>
                  <th className={th}>Wet pace</th>
                  <th className={th}>Fuel/lap</th>
                </tr>
              </thead>
              <tbody>
                {wetDrivers.map((d) => (
                  <tr key={d.driver} className="border-t border-zinc-800/60 text-zinc-200">
                    <td className="py-1 pr-2">{d.driver}</td>
                    <td className={td}>{d.laps}</td>
                    <td className={td}>{fmtLap(d.medianSec)}</td>
                    <td className={td}>{d.fuelPerLap.toFixed(2)} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            Wet pace is highly variable (line, standing water, tyres) — treat as
            a rough reference. Use the Dry/Wet toggle in Event to re-plan the
            race at wet pace.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pace & consistency box/whisker */}
        <div>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Pace &amp; consistency
          </h3>
          <svg viewBox={`0 0 ${B.right + 8} ${boxH}`} className="w-full" role="img">
            {tickVals.map((v, i) => (
              <g key={i}>
                <line x1={bx(v)} y1={B.top} x2={bx(v)} y2={B.top + drivers.length * B.rowH} stroke="#27272a" strokeWidth={1} />
                <text x={bx(v)} y={boxH - 8} fontSize={9} fill="#71717a" textAnchor="middle">{fmtLap(v)}</text>
              </g>
            ))}
            {drivers.map((d, i) => {
              const y = B.top + i * B.rowH + B.rowH / 2;
              return (
                <g key={d.driver}>
                  <text x={0} y={y + 3} fontSize={10} fill="#d4d4d8">
                    {d.driver.length > 16 ? d.driver.slice(0, 15) + "…" : d.driver}
                  </text>
                  {/* whisker */}
                  <line x1={bx(d.minSec)} y1={y} x2={bx(d.maxSec)} y2={y} stroke={color(i)} strokeWidth={1} strokeOpacity={0.5} />
                  {/* box q1..q3 */}
                  <rect x={bx(d.q1Sec)} y={y - 6} width={Math.max(1, bx(d.q3Sec) - bx(d.q1Sec))} height={12} fill={color(i)} fillOpacity={0.25} stroke={color(i)} strokeWidth={1} />
                  {/* median tick */}
                  <line x1={bx(d.racePaceSec)} y1={y - 7} x2={bx(d.racePaceSec)} y2={y + 7} stroke={color(i)} strokeWidth={2} />
                  {/* best dot */}
                  <circle cx={bx(d.minSec)} cy={y} r={2.4} fill={color(i)} />
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-[10px] text-zinc-600">
            Box = middle 50% of laps, line = median, dot = best. Tighter box =
            more consistent. Normalised to {analysis.temp.sourceTempC != null ? `${Math.round(analysis.temp.sourceTempC)}°C` : "one temp"}.
          </p>
        </div>

        {/* Fuel per lap */}
        <div>
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Fuel per lap
          </h3>
          <svg viewBox={`0 0 ${F.right + 40} ${fuelH}`} className="w-full" role="img">
            {drivers.map((d, i) => {
              const y = F.top + i * F.rowH + F.rowH / 2;
              return (
                <g key={d.driver}>
                  <text x={0} y={y + 3} fontSize={10} fill="#d4d4d8">
                    {d.driver.length > 16 ? d.driver.slice(0, 15) + "…" : d.driver}
                  </text>
                  <rect x={F.labelW} y={y - 7} width={Math.max(1, fx(d.fuelPerLap) - F.labelW)} height={14} rx={2} fill={color(i)} fillOpacity={0.55} />
                  <text x={fx(d.fuelPerLap) + 4} y={y + 3} fontSize={10} fill="#a1a1aa">{d.fuelPerLap.toFixed(2)} L</text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-[10px] text-zinc-600">
            Median fuel burned on clean laps — lower can drop a pit stop.
          </p>
        </div>

        {/* Lap time vs track temp */}
        <div className="lg:col-span-2">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Lap time vs track temp
          </h3>
          {scatter ?? (
            <p className="text-[11px] text-zinc-500">
              Not enough laps across different track temperatures to plot the
              temperature relationship yet.
            </p>
          )}
          {scatter && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Each point is a clean lap shown as its gap to that driver&rsquo;s own
              median, so drivers overlay. Dashed line = the fitted temperature
              trend{analysis.temp.slopePerC != null ? ` (${(analysis.temp.slopePerC * 10).toFixed(1)} s/10°C)` : ""}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
