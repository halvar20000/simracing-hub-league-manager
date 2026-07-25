"use client";

import { useMemo, useState } from "react";
import type { PlannerRaceLog } from "@/lib/stint-plan-state";

/**
 * Team-performance dashboard for an uploaded race-logger JSONL.
 *
 * Scope is deliberately OUR car only: how our drivers compared with each other
 * over the race. The single outside number is the fastest lap in our class,
 * drawn as a reference line so the gap is visible without listing the field.
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

const colorFor = (slot: number) => SERIES[Math.min(slot, SERIES.length - 1)];

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

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

export default function RaceLogDashboard({ log }: { log: PlannerRaceLog }) {
  // Memoised so the chart models below don't recompute on every render just
  // because `?? []` minted a fresh array.
  const drivers = useMemo(() => log.drivers ?? [], [log.drivers]);
  const laps = useMemo(() => log.laps ?? [], [log.laps]);
  const stints = log.stints ?? [];

  const teamBest = useMemo(() => {
    const xs = drivers
      .map((d) => d.bestSec)
      .filter((n): n is number => n != null);
    return xs.length ? Math.min(...xs) : null;
  }, [drivers]);
  const reference = log.classBestSec ?? teamBest;

  if (drivers.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No lap data for our car in this log.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Per-driver summary — this is also the table view for the charts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {drivers.map((d) => (
          <div
            key={d.driver}
            className="rounded border border-zinc-800 bg-zinc-950/60 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(d.slot) }}
              />
              <span className="truncate text-sm font-semibold text-zinc-100">
                {d.driver}
              </span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-zinc-50">
              {fmtLapSec(d.greenSec)}
            </div>
            <div className="text-xs text-zinc-500">green-lap pace (median)</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt className="text-zinc-500">Laps</dt>
              <dd className="text-right text-zinc-200">{d.laps}</dd>
              <dt className="text-zinc-500">Best</dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.bestSec)}</dd>
              <dt className="text-zinc-500">Average</dt>
              <dd className="text-right text-zinc-200">{fmtLapSec(d.avgSec)}</dd>
              <dt className="text-zinc-500">Spread</dt>
              <dd className="text-right text-zinc-200">
                {d.spreadSec == null ? "—" : `${d.spreadSec.toFixed(3)} s`}
              </dd>
              <dt className="text-zinc-500">Stints</dt>
              <dd className="text-right text-zinc-200">
                {d.stints} · {d.pits} stop{d.pits === 1 ? "" : "s"}
              </dd>
              <dt className="text-zinc-500">Incidents</dt>
              <dd
                className={`text-right ${
                  d.incidents > 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {d.incidents}
              </dd>
            </dl>
          </div>
        ))}
      </div>

      <LapTrace laps={laps} drivers={drivers} reference={reference} log={log} />

      <div className="grid gap-5 lg:grid-cols-2">
        <PaceBars drivers={drivers} reference={reference} />
        <SpreadBars drivers={drivers} />
        <CountBars
          title="Laps driven"
          rows={drivers.map((d) => ({
            label: d.driver,
            slot: d.slot,
            value: d.laps,
            display: String(d.laps),
          }))}
        />
        <CountBars
          title="Incidents"
          rows={drivers.map((d) => ({
            label: d.driver,
            slot: d.slot,
            value: d.incidents,
            display: String(d.incidents),
          }))}
          emptyNote="No incidents logged — clean race."
        />
      </div>

      {stints.length > 0 && <StintBars log={log} />}
    </div>
  );
}

// ---------------------------------------------------------------- lap trace

function LapTrace({
  laps,
  drivers,
  reference,
  log,
}: {
  laps: PlannerRaceLog["laps"];
  drivers: PlannerRaceLog["drivers"];
  reference: number | null;
  log: PlannerRaceLog;
}) {
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);

  const W = 820;
  const H = 280;
  const P = { l: 58, r: 16, t: 14, b: 28 };

  const model = useMemo(() => {
    if (laps.length === 0) return null;
    const secs = laps.map((l) => l.sec);
    const minSec = Math.min(...secs, reference ?? Infinity);
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
    for (const l of laps) {
      const outOfScale = l.sec > yMax;
      if (outOfScale) above += 1;
      const breakHere =
        cur == null ||
        cur.d !== l.d ||
        outOfScale ||
        (prevLap != null && l.lap - prevLap > 1);
      if (outOfScale) {
        cur = null;
        prevLap = l.lap;
        continue;
      }
      if (breakHere) {
        cur = { d: l.d, pts: [] };
        segments.push(cur);
      }
      cur!.pts.push({ x: x(l.lap), y: y(l.sec) });
      prevLap = l.lap;
    }

    const ticks: number[] = [];
    const step = (yMax - yMin) / 4;
    for (let i = 0; i <= 4; i++) ticks.push(yMin + step * i);

    return { x, y, yMin, yMax, xMin, xMax, segments, ticks, above };
  }, [laps, reference, P.l, P.r, P.t, P.b]);

  if (!model) return null;

  const hovered = hover ? laps[hover.i] : null;
  const hoveredDriver = hovered ? drivers[hovered.d] : null;

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
        </span>
        <span className="text-xs text-zinc-500">
          {model.above > 0
            ? `${model.above} lap${model.above === 1 ? "" : "s"} above the scale (pit / caution)`
            : "all laps in scale"}
        </span>
      </figcaption>

      <Legend drivers={drivers} reference={log.classBestSec} log={log} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Lap time per lap for each team driver"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines + y ticks */}
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

        {/* x axis: lap numbers */}
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

        {/* class-best reference */}
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

        {/* the traces */}
        {model.segments.map((seg, i) =>
          seg.pts.length < 2 ? (
            seg.pts.length === 1 ? (
              <circle
                key={i}
                cx={seg.pts[0].x}
                cy={seg.pts[0].y}
                r={2.5}
                fill={colorFor(drivers[seg.d]?.slot ?? seg.d)}
              />
            ) : null
          ) : (
            <polyline
              key={i}
              points={seg.pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={colorFor(drivers[seg.d]?.slot ?? seg.d)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        )}

        {/* pit stops */}
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

        {/* crosshair */}
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
              fill={colorFor(hoveredDriver?.slot ?? 0)}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {hover && hovered && (
        <div
          className="pointer-events-none absolute top-[4.75rem] z-10 rounded border border-zinc-700 bg-zinc-900/95 px-2 py-1 text-xs text-zinc-200 shadow-lg"
          style={{
            // Follow the crosshair but stay inside the card at both edges.
            left: `${Math.min(88, Math.max(12, (hover.x / W) * 100))}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-semibold">Lap {hovered.lap}</div>
          <div className="text-zinc-400">{hoveredDriver?.driver ?? "—"}</div>
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

function Legend({
  drivers,
  reference,
  log,
}: {
  drivers: PlannerRaceLog["drivers"];
  reference: number | null;
  log: PlannerRaceLog;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
      {drivers.map((d) => (
        <span key={d.driver} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ backgroundColor: colorFor(d.slot) }}
          />
          {d.driver}
        </span>
      ))}
      {reference != null && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-zinc-400" />
          class best{log.ownCarClass ? ` (${log.ownCarClass})` : ""}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- charts

/** Green pace per driver, drawn as the gap to the class-best lap. */
function PaceBars({
  drivers,
  reference,
}: {
  drivers: PlannerRaceLog["drivers"];
  reference: number | null;
}) {
  const rows = drivers
    .map((d) => ({
      label: d.driver,
      slot: d.slot,
      value: d.greenSec != null && reference != null ? d.greenSec - reference : null,
      pace: d.greenSec,
    }))
    .filter((r) => r.value != null) as {
    label: string;
    slot: number;
    value: number;
    pace: number | null;
  }[];
  const max = Math.max(0.001, ...rows.map((r) => r.value));

  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 text-sm font-semibold text-zinc-200">
        Green pace — gap to class best
      </figcaption>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">No comparable pace in this log.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(r.slot) }}
                  />
                  {r.label}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {fmtLapSec(r.pace)}{" "}
                  <span className="text-zinc-500">({fmtGap(r.value)} s)</span>
                </span>
              </div>
              <div className="h-3 w-full rounded-sm bg-zinc-900">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{
                    width: `${Math.max(2, (r.value / max) * 100)}%`,
                    backgroundColor: colorFor(r.slot),
                  }}
                  title={`${r.label}: ${fmtGap(r.value)} s off class best`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Consistency: how far the green laps spread above each driver's own best. */
function SpreadBars({ drivers }: { drivers: PlannerRaceLog["drivers"] }) {
  const rows = drivers.filter((d) => d.spreadSec != null);
  const max = Math.max(0.001, ...rows.map((d) => d.spreadSec as number));
  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-1 text-sm font-semibold text-zinc-200">
        Consistency
      </figcaption>
      <p className="mb-3 text-xs text-zinc-500">
        Spread of the green laps above each driver&apos;s own best — shorter is
        steadier.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">Not enough laps to measure.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => (
            <li key={d.driver}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(d.slot) }}
                  />
                  {d.driver}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {(d.spreadSec as number).toFixed(3)} s
                </span>
              </div>
              <div className="h-3 w-full rounded-sm bg-zinc-900">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{
                    width: `${Math.max(2, ((d.spreadSec as number) / max) * 100)}%`,
                    backgroundColor: colorFor(d.slot),
                  }}
                  title={`${d.driver}: ${(d.spreadSec as number).toFixed(3)} s spread`}
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
  rows,
  emptyNote,
}: {
  title: string;
  rows: { label: string; slot: number; value: number; display: string }[];
  emptyNote?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 text-sm font-semibold text-zinc-200">
        {title}
      </figcaption>
      {max === 0 && emptyNote ? (
        <p className="text-xs text-emerald-300">{emptyNote}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorFor(r.slot) }}
                  />
                  {r.label}
                </span>
                <span className="tabular-nums text-zinc-400">{r.display}</span>
              </div>
              <div className="h-3 w-full rounded-sm bg-zinc-900">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{
                    width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 2}%`,
                    backgroundColor: colorFor(r.slot),
                  }}
                  title={`${r.label}: ${r.display}`}
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
function StintBars({ log }: { log: PlannerRaceLog }) {
  const stints = log.stints ?? [];
  const paces = stints
    .map((s) => s.avgSec)
    .filter((n): n is number => n != null);
  const min = paces.length ? Math.min(...paces) : 0;
  const max = paces.length ? Math.max(...paces) : 1;
  const span = Math.max(0.001, max - min);

  return (
    <figure className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-200">
          Stint by stint{log.ownCarNumber ? ` — car #${log.ownCarNumber}` : ""}
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
              <th className="py-1 pr-2 w-1/3">Stint pace</th>
              <th className="py-1 pr-2 text-right">Pit</th>
            </tr>
          </thead>
          <tbody>
            {stints.map((st) => {
              const frac =
                st.avgSec == null ? 0 : 0.25 + 0.75 * (1 - (st.avgSec - min) / span);
              return (
                <tr key={st.index} className="border-t border-zinc-800/60 text-zinc-200">
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
                        style={{ backgroundColor: colorFor(log.drivers[st.d]?.slot ?? st.d) }}
                      />
                      {st.drivers.join(", ") || "—"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2">
                      <span className="h-3 flex-1 rounded-sm bg-zinc-900">
                        <span
                          className="block h-3 rounded-r-[4px]"
                          style={{
                            width: `${Math.max(2, frac * 100)}%`,
                            backgroundColor: colorFor(
                              log.drivers[st.d]?.slot ?? st.d
                            ),
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
