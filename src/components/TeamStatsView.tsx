"use client";

import { useState } from "react";
import type { TeamStats, TeamStatsDriver, TeamStatsCell } from "@/lib/team-stats";
import { fmtLap, fmtPct } from "@/lib/debrief";

/**
 * The team's own performance statistic.
 *
 * The CLS version of the workbook a team lead keeps by hand: one row per
 * driver per race, career totals, and the trend across the season. Colours are
 * the validated categorical slots for a dark surface; a driver keeps the same
 * slot across every panel on the page.
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
const colorFor = (slot: number) =>
  slot < 0 ? "#52525b" : SERIES[Math.min(slot, SERIES.length - 1)];

const card =
  "rounded-lg border border-zinc-800 bg-zinc-950 p-4 print:border-zinc-300 print:bg-white";
const h2 =
  "mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300 print:text-zinc-900";
const th =
  "border-b border-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400 print:border-zinc-300 print:text-zinc-700";
const td = "px-2 py-1.5 text-zinc-200 print:text-zinc-900";

const fmtNum = (x: number | null, digits = 2) =>
  x == null || !Number.isFinite(x) ? "—" : x.toFixed(digits).replace(".", ",");

function fmtDrive(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec - h * 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

type Metric = "relPerf" | "consistency" | "incPerHour";

const METRICS: {
  key: Metric;
  label: string;
  fmt: (x: number | null) => string;
  higherIsBetter: boolean;
}[] = [
  {
    key: "relPerf",
    label: "Relativperformance",
    fmt: (x) => fmtPct(x, 2),
    higherIsBetter: true,
  },
  {
    key: "consistency",
    label: "Konstanz",
    fmt: (x) => fmtPct(x, 2),
    higherIsBetter: true,
  },
  {
    key: "incPerHour",
    label: "Incidents pro Stunde",
    fmt: (x) => fmtNum(x, 2),
    higherIsBetter: false,
  },
];

export type TeamStatsProp = Omit<TeamStats, "races"> & {
  races: (TeamStats["races"][number] & { racedAtMs: number })[];
};

export default function TeamStatsView({ stats }: { stats: TeamStatsProp }) {
  const [metric, setMetric] = useState<Metric>("relPerf");
  const active = METRICS.find((m) => m.key === metric)!;
  const imported = stats.races.filter((r) => r.source === "import").length;

  const valueOf = (c: TeamStatsCell | null): number | null => {
    if (!c) return null;
    if (metric === "relPerf") return c.relPerf ?? c.perf10k;
    if (metric === "consistency") return c.consistency;
    return c.incPerHour;
  };

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{stats.groupName}</h1>
          <p className="text-sm text-zinc-400 print:text-zinc-600">
            {stats.races.length}{" "}
            {stats.races.length === 1 ? "Rennen" : "Rennen"} ·{" "}
            {stats.drivers.length} Fahrer
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 print:hidden"
        >
          Drucken / PDF
        </button>
      </div>

      {imported > 0 && (
        <p className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 print:border-zinc-300 print:bg-white print:text-zinc-600">
          {imported} {imported === 1 ? "Rennen ist" : "Rennen sind"} aus der
          Team-Tabelle übernommen und nicht in CLS gemessen — in den Tabellen mit
          <span className="mx-1 text-zinc-300">†</span> markiert. Für diese
          Rennen gibt es nur Relativperformance und Konstanz.
        </p>
      )}

      {/* ---- per-race matrix ------------------------------------------- */}
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={`${h2} mb-0`}>{active.label} je Rennen</h2>
          <div className="flex gap-1 print:hidden">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded px-2 py-1 text-xs ${
                  m.key === metric
                    ? "bg-[#ff6b35] font-semibold text-zinc-950"
                    : "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 bg-zinc-950 print:bg-white`}>
                  Fahrer
                </th>
                {stats.races.map((r) => (
                  <th key={r.sourceKey} className={`${th} text-right`}>
                    <span title={`${r.label} — ${fmtDate(r.racedAtMs)}`}>
                      {r.label}
                      {r.source === "import" && (
                        <span className="text-zinc-600"> †</span>
                      )}
                    </span>
                  </th>
                ))}
                <th className={`${th} text-right`}>Ø</th>
              </tr>
            </thead>
            <tbody>
              {stats.drivers.map((d, i) => {
                const avg =
                  metric === "relPerf"
                    ? d.avgRelPerf
                    : metric === "consistency"
                      ? d.avgConsistency
                      : d.avgIncPerHour;
                return (
                  <tr
                    key={d.key}
                    className="border-b border-zinc-900 last:border-0 print:border-zinc-200"
                  >
                    <td
                      className={`${td} sticky left-0 whitespace-nowrap bg-zinc-950 print:bg-white`}
                    >
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: colorFor(i) }}
                      />
                      {d.name}
                    </td>
                    {d.cells.map((c, k) => (
                      <td
                        key={stats.races[k].sourceKey}
                        className={`${td} text-right tabular-nums ${
                          valueOf(c) == null ? "text-zinc-700" : ""
                        }`}
                      >
                        {active.fmt(valueOf(c))}
                      </td>
                    ))}
                    <td className={`${td} text-right font-medium tabular-nums`}>
                      {active.fmt(avg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- trend, one small panel per driver -------------------------- */}
      {stats.races.length >= 2 && (
        <section className={card}>
          <h2 className={h2}>{active.label} im Verlauf</h2>
          <TrendGrid
            races={stats.races.map((r) => r.label)}
            series={stats.drivers.map((d, i) => ({
              name: d.name,
              slot: i,
              values: d.cells.map(valueOf),
            }))}
            fmt={active.fmt}
            higherIsBetter={active.higherIsBetter}
          />
        </section>
      )}

      {/* ---- career totals ---------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Über alle Rennen</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr>
                <th className={th}>Fahrer</th>
                <th className={`${th} text-right`}>Rennen</th>
                <th className={`${th} text-right`}>Runden</th>
                <th className={`${th} text-right`}>Fahrzeit</th>
                <th className={`${th} text-right`}>beste Runde</th>
                <th className={`${th} text-right`}>Ø Relativperf.</th>
                <th className={`${th} text-right`}>Ø Konstanz</th>
                <th className={`${th} text-right`}>Incs</th>
                <th className={`${th} text-right`}>Ø Incs/h</th>
                <th className={`${th} text-right`}>iRating</th>
              </tr>
            </thead>
            <tbody>
              {stats.drivers.map((d, i) => (
                <tr
                  key={d.key}
                  className="border-b border-zinc-900 last:border-0 print:border-zinc-200"
                >
                  <td className={`${td} whitespace-nowrap`}>
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: colorFor(i) }}
                    />
                    {d.name}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{d.races}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {d.laps || "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {fmtDrive(d.driveSec)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {fmtLap(d.bestSec)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {fmtPct(d.avgRelPerf, 2)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {fmtPct(d.avgConsistency, 2)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {d.incidents ?? "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {fmtNum(d.avgIncPerHour, 2)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {d.iRating ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 print:text-zinc-600">
          Die Durchschnitte sind ungewichtete Mittel über die Rennen, in denen
          die Kennzahl vorliegt — ein 24-Stunden-Rennen zählt also so viel wie
          ein Sechsstünder. Runden, Fahrzeit und Incidents summieren nur die in
          CLS gemessenen Rennen.
        </p>
      </section>

      {/* ---- the races themselves --------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Ausgewertete Rennen</h2>
        <table className="w-full text-xs">
          <tbody>
            {stats.races.map((r) => (
              <tr
                key={r.sourceKey}
                className="border-b border-zinc-900 last:border-0 print:border-zinc-200"
              >
                <td className={`${td} whitespace-nowrap`}>{r.label}</td>
                <td className={`${td} text-zinc-400 print:text-zinc-600`}>
                  {[r.track, r.car, r.teamName].filter(Boolean).join(" · ") ||
                    "—"}
                </td>
                <td
                  className={`${td} whitespace-nowrap text-right text-zinc-400 print:text-zinc-600`}
                >
                  {fmtDate(r.racedAtMs)}
                </td>
                <td
                  className={`${td} whitespace-nowrap text-right text-zinc-500`}
                >
                  {r.source === "import" ? "† übernommen" : "in CLS gemessen"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * The trend as small multiples — one panel per driver, shared scale.
 *
 * The palette has six slots and a squad can have a dozen drivers; one frame
 * with every line on it would either repeat a colour or invent one, and past
 * about four lines nobody can follow a single driver anyway. The shared scale
 * is what keeps the panels comparable.
 */
function TrendGrid({
  races,
  series,
  fmt,
  higherIsBetter,
}: {
  races: string[];
  series: { name: string; slot: number; values: (number | null)[] }[];
  fmt: (x: number | null) => string;
  higherIsBetter: boolean;
}) {
  const all = series.flatMap((s) =>
    s.values.filter((v): v is number => v != null && Number.isFinite(v))
  );
  if (all.length === 0)
    return <p className="text-xs text-zinc-600">Keine Werte für diese Kennzahl.</p>;

  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || Math.abs(hi) * 0.05 || 0.01) * 0.15;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const W = 240;
  const H = 62;
  const PADX = 7;
  const x = (i: number) =>
    races.length <= 1 ? W / 2 : PADX + (i / (races.length - 1)) * (W - PADX * 2);
  const y = (v: number) => H - 8 - ((v - yMin) / (yMax - yMin)) * (H - 16);

  const withData = series.filter((s) =>
    s.values.some((v) => v != null && Number.isFinite(v))
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {withData.map((s) => {
          const pts = s.values
            .map((v, i) => (v == null ? null : { i, v }))
            .filter((p): p is { i: number; v: number } => p != null);
          const dPath = pts
            .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`)
            .join(" ");
          const last = pts[pts.length - 1];
          return (
            <div key={s.name}>
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate text-[11px] text-zinc-300 print:text-zinc-800">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colorFor(s.slot) }}
                  />
                  {s.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 print:text-zinc-600">
                  {last ? fmt(last.v) : "—"}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="h-16 w-full"
                role="img"
                aria-label={`${s.name}: Verlauf über ${pts.length} Rennen`}
              >
                <line
                  x1={0}
                  y1={H - 8}
                  x2={W}
                  y2={H - 8}
                  stroke={GRID}
                  strokeWidth={1}
                />
                {pts.length > 1 && (
                  <path
                    d={dPath}
                    fill="none"
                    stroke={colorFor(s.slot)}
                    strokeWidth={2}
                  />
                )}
                {pts.map((p) => (
                  <circle
                    key={p.i}
                    cx={x(p.i)}
                    cy={y(p.v)}
                    r={4}
                    fill={colorFor(s.slot)}
                    stroke="#09090b"
                    strokeWidth={2}
                  >
                    <title>{`${races[p.i] ?? ""}: ${fmt(p.v)}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 print:text-zinc-600">
        Gleiche Skala in allen Feldern ({fmt(yMin)} – {fmt(yMax)}),{" "}
        {higherIsBetter ? "höher ist besser" : "niedriger ist besser"}. Rennen von
        links nach rechts: {races.join(" · ")}
      </p>
    </div>
  );
}
