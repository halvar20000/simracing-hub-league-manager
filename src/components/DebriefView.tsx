"use client";

import { useState, useTransition } from "react";
import type { DebriefData, DebriefDriver } from "@/lib/debrief";
import { fmtLap, fmtDelta, fmtPct } from "@/lib/debrief";
import { refreshDebriefHistory } from "@/lib/actions/debrief";

/**
 * The post-race de-briefing, as the team reads it.
 *
 * Modelled on the deck Johann Solowej builds by hand after every endurance
 * race — awards, the metric table, the trend over the season and the raw
 * numbers behind them — but computed from the plan instead of typed, so it
 * cannot disagree with the dashboard on the plan page.
 *
 * Colours are the validated categorical slots for a dark surface, the same
 * ones the race-log dashboard assigns, so a driver keeps their colour from the
 * lap trace through to the season trend.
 */

const SERIES = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#9085e9", // violet
] as const;
const GRID = "#27272a";
const AXIS = "#71717a";

const colorFor = (slot: number) =>
  slot < 0 ? "#52525b" : SERIES[Math.min(slot, SERIES.length - 1)];

const card =
  "rounded-lg border border-zinc-800 bg-zinc-950 p-4 print:border-zinc-300 print:bg-white";
const h2 =
  "mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300 print:text-zinc-900";
const th =
  "border-b border-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400 print:border-zinc-300 print:text-zinc-700";
const td = "px-2 py-1.5 text-zinc-200 print:text-zinc-900";

/** hh:mm from seconds — how long someone actually sat in the car. */
function fmtDrive(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec - h * 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
}

const fmtNum = (x: number | null, digits = 2) =>
  x == null || !Number.isFinite(x) ? "—" : x.toFixed(digits).replace(".", ",");

/**
 * A cell tint that says where this number sits in its own column.
 *
 * Deliberately a tint and not a full traffic light: the point is to make the
 * spread visible at a glance, not to grade people. Alpha stays low enough for
 * the text to keep its contrast on both the dark page and a printed sheet.
 */
function rankTint(
  value: number | null,
  values: number[],
  higherIsBetter: boolean
): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return undefined;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (hi === lo) return undefined;
  const t = (value - lo) / (hi - lo); // 0 = lowest, 1 = highest
  const good = higherIsBetter ? t : 1 - t;
  // green for good, amber for poor — both muted.
  return good >= 0.5
    ? `rgba(25,158,112,${(good - 0.5) * 0.5})`
    : `rgba(217,89,38,${(0.5 - good) * 0.5})`;
}

export type DebriefHistoryProp = {
  races: { planId: string; label: string; racedAtMs: number }[];
  byDriver: {
    name: string;
    points:
      | ({
          relPerf: number | null;
          perf10k: number | null;
          consistency: number | null;
        } | null)[];
  }[];
};

export default function DebriefView({
  planId,
  data,
  history,
  postNotes,
  canManage,
}: {
  planId: string;
  data: DebriefData;
  history: DebriefHistoryProp;
  postNotes: string;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const d = data.drivers;

  const subtitle = [data.track, data.car].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5 print:space-y-3">
      {/* ---- header ---------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">De-briefing</h1>
          <p className="text-sm text-zinc-400 print:text-zinc-600">
            {data.title}
            {subtitle && <span className="text-zinc-500"> — {subtitle}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a
            href={`/api/export/debriefing?id=${encodeURIComponent(planId)}`}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ⬇ PowerPoint (.pptx)
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Drucken / PDF
          </button>
          {canManage && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await refreshDebriefHistory(planId);
                  setMsg(
                    r.ok
                      ? `Historie aktualisiert (${r.drivers} Fahrer).`
                      : r.error
                  );
                })
              }
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-60"
            >
              {pending ? "Speichere…" : "Historie aktualisieren"}
            </button>
          )}
        </div>
      </div>
      {msg && (
        <p className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 print:hidden">
          {msg}
        </p>
      )}

      {data.notes.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 print:border-zinc-300 print:bg-white print:text-zinc-700">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {/* ---- awards ----------------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Auszeichnungen (schnell und sicher)</h2>
        <table className="w-full text-sm">
          <tbody>
            {data.awards.map((a) => (
              <tr key={a.key} className="border-b border-zinc-900 last:border-0 print:border-zinc-200">
                <td className={`${td} w-1/3 text-zinc-400 print:text-zinc-600`}>
                  {a.label}
                </td>
                <td className={`${td} font-medium`}>{a.winner ?? "—"}</td>
                <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                  {a.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- evaluation ------------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Auswertung</h2>
        <MetricBars drivers={d} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr>
                <th className={th}>Fahrer</th>
                <th className={`${th} text-right`}>gesamt vs. clean</th>
                <th className={`${th} text-right`}>gesamt vs. Prognose</th>
                <th className={`${th} text-right`}>clean vs. Best</th>
                <th className={`${th} text-right`}>beste Runde vs. Referenz</th>
                <th className={`${th} text-right`}>Incs/h</th>
                <th className={`${th} text-right`}>Relativperformance</th>
                <th className={`${th} text-right`}>10k-Performance</th>
                <th className={`${th} text-right`}>Konstanz</th>
              </tr>
            </thead>
            <tbody>
              {d.map((r) => (
                <tr key={r.name} className="border-b border-zinc-900 last:border-0 print:border-zinc-200">
                  <td className={`${td} whitespace-nowrap`}>
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: colorFor(r.slot) }}
                    />
                    {r.name}
                  </td>
                  <Cell v={r.dAllVsClean} all={d.map((x) => x.dAllVsClean)} good="low" fmt={fmtDelta} />
                  <Cell v={r.dAllVsPlan} all={d.map((x) => x.dAllVsPlan)} good="low" fmt={fmtDelta} />
                  <Cell v={r.dCleanVsBest} all={d.map((x) => x.dCleanVsBest)} good="low" fmt={fmtDelta} />
                  <Cell v={r.dBestVsRef} all={d.map((x) => x.dBestVsRef)} good="low" fmt={fmtDelta} />
                  <Cell
                    v={data.incidentsMeasured ? r.incPerHour : null}
                    all={d.map((x) => (data.incidentsMeasured ? x.incPerHour : null))}
                    good="low"
                    fmt={(x) => fmtNum(x, 2)}
                  />
                  <Cell v={r.relPerf} all={d.map((x) => x.relPerf)} good="high" fmt={(x) => fmtPct(x)} />
                  <Cell v={r.perf10k} all={d.map((x) => x.perf10k)} good="high" fmt={(x) => fmtPct(x)} />
                  <Cell v={r.consistency} all={d.map((x) => x.consistency)} good="high" fmt={(x) => fmtPct(x)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 print:text-zinc-600">
          <b>Relativperformance</b> = die Rundenzeit, die das eigene iRating hier
          wert war, geteilt durch die tatsächlich gefahrene beste Runde — über
          100 % heißt schneller als das eigene Rating.{" "}
          <b>10k-Performance</b> misst dasselbe gegen die feste
          10k-Referenzrunde und ist damit über Rennen hinweg vergleichbar.{" "}
          <b>Konstanz</b> = 1 − σ ÷ Ø über die sauberen Runden, je Fahrer gegen
          die eigenen Runden gemessen, nie Fahrer gegen Fahrer.{" "}
          <b>Incs/h</b> statt Incidents gesamt, damit nicht bestraft wird, wer
          die meisten Stints übernommen hat.
        </p>
      </section>

      {/* ---- season trend ------------------------------------------------ */}
      {history.races.length >= 2 ? (
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
          <section className={card}>
            <h2 className={h2}>Relativperformance im Verlauf</h2>
            <TrendChart
              races={history.races}
              series={history.byDriver.map((x, i) => ({
                name: x.name,
                slot: d.find((r) => r.name === x.name)?.slot ?? i,
                values: x.points.map((p) => p?.relPerf ?? p?.perf10k ?? null),
              }))}
            />
          </section>
          <section className={card}>
            <h2 className={h2}>Konstanz im Verlauf</h2>
            <TrendChart
              races={history.races}
              series={history.byDriver.map((x, i) => ({
                name: x.name,
                slot: d.find((r) => r.name === x.name)?.slot ?? i,
                values: x.points.map((p) => p?.consistency ?? null),
              }))}
            />
          </section>
        </div>
      ) : (
        <section className={`${card} print:hidden`}>
          <h2 className={h2}>Verlauf über die Saison</h2>
          <p className="text-sm text-zinc-400">
            {history.races.length === 0
              ? "Noch keine Historie. Sie entsteht, sobald ein Plan als abgeschlossen markiert wird — oder sofort über „Historie aktualisieren“ oben."
              : "Ein Rennen ist in der Historie. Ab dem zweiten wird hier eine Kurve daraus."}
          </p>
        </section>
      )}

      {/* ---- appendix ---------------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Anhang — die Rohdaten</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr>
                <th className={th}>Fahrer</th>
                <th className={`${th} text-right`}>Ø gesamt</th>
                <th className={`${th} text-right`}>Ø clean</th>
                <th className={`${th} text-right`}>Prognose</th>
                <th className={`${th} text-right`}>beste Runde</th>
                <th className={`${th} text-right`}>Referenz</th>
                <th className={`${th} text-right`}>Runden</th>
                <th className={`${th} text-right`}>Stints</th>
                <th className={`${th} text-right`}>Fahrzeit</th>
                <th className={`${th} text-right`}>Incs</th>
                <th className={`${th} text-right`}>iRating</th>
              </tr>
            </thead>
            <tbody>
              {d.map((r) => (
                <tr key={r.name} className="border-b border-zinc-900 last:border-0 print:border-zinc-200">
                  <td className={`${td} whitespace-nowrap`}>{r.name}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.avgAllSec)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.avgCleanSec)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.planSec)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.bestSec)}</td>
                  <td className={`${td} text-right tabular-nums`} title={baselineLabel(r)}>
                    {fmtLap(r.baselineSec)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.laps ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.stints || "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtDrive(r.driveSec)}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {data.incidentsMeasured ? (r.incidents ?? "—") : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.iRating ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500 print:text-zinc-600">
          Referenz ={" "}
          {data.official
            ? "die Rundenzeit des eigenen iRatings aus der Pace-Kurve, sonst die feste 10k-Referenz"
            : "die schnellste Runde der eigenen Klasse"}
          . Die Zuordnung der Stints stammt{" "}
          {data.attribution === "plan"
            ? "aus dem Stintplan"
            : data.attribution === "log"
              ? "aus dem Race-Log selbst"
              : "aus einer Rekonstruktion der Ergebnisse"}
          .
        </p>
      </section>

      {/* ---- discussion --------------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Diskussion</h2>
        {postNotes.trim() ? (
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-200 print:text-zinc-900">
            {postNotes}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            Noch keine Notizen. Die Post-Race-Notes des Plans erscheinen hier —
            und die PowerPoint bringt eine leere Diskussionsfolie mit den
            Stichworten mit.
          </p>
        )}
      </section>
    </div>
  );
}

function baselineLabel(r: DebriefDriver): string {
  switch (r.baseline) {
    case "irating":
      return `Zielzeit für ${r.iRating} iR`;
    case "ref10k":
      return "feste 10k-Referenz";
    case "classbest":
      return "schnellste Runde der Klasse";
    default:
      return "schnellste Runde des Teams";
  }
}

function Cell({
  v,
  all,
  good,
  fmt,
}: {
  v: number | null;
  all: (number | null)[];
  good: "high" | "low";
  fmt: (x: number | null) => string;
}) {
  const xs = all.filter((x): x is number => x != null && Number.isFinite(x));
  const bg = rankTint(v, xs, good === "high");
  return (
    <td
      className="px-2 py-1.5 text-right tabular-nums text-zinc-200 print:text-zinc-900"
      style={bg ? { background: bg } : undefined}
    >
      {fmt(v)}
    </td>
  );
}

/**
 * The three headline metrics, as three separate panels.
 *
 * Johann's slide puts percentages and incidents-per-hour on one chart with two
 * y-axes. Two scales on one frame make the bars look comparable when they are
 * not, so they are split: one measure, one axis, one panel. Each bar carries
 * its driver's name, so identity never rests on colour alone.
 */
function MetricBars({ drivers }: { drivers: DebriefDriver[] }) {
  const panels: {
    key: string;
    title: string;
    pick: (d: DebriefDriver) => number | null;
    fmt: (x: number) => string;
    /** Percent panels are read around 100 %, so the axis starts at the data. */
    zeroBased: boolean;
  }[] = [
    {
      key: "rel",
      title: "Relativperformance",
      pick: (d) => d.relPerf ?? d.perf10k,
      fmt: (x) => fmtPct(x, 2),
      zeroBased: false,
    },
    {
      key: "kon",
      title: "Konstanz",
      pick: (d) => d.consistency,
      fmt: (x) => fmtPct(x, 2),
      zeroBased: false,
    },
    {
      key: "inc",
      title: "Incidents pro Stunde",
      pick: (d) => d.incPerHour,
      fmt: (x) => fmtNum(x, 2),
      zeroBased: true,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {panels.map((p) => {
        const vals = drivers
          .map((d) => ({ d, v: p.pick(d) }))
          .filter((x): x is { d: DebriefDriver; v: number } => x.v != null);
        if (vals.length === 0)
          return (
            <div key={p.key}>
              <p className="mb-2 text-xs font-medium text-zinc-400">{p.title}</p>
              <p className="text-xs text-zinc-600">keine Daten</p>
            </div>
          );
        const hi = Math.max(...vals.map((x) => x.v));
        const lo = p.zeroBased ? 0 : Math.min(...vals.map((x) => x.v));
        // A little headroom so the longest bar is not flush with the frame.
        const span = hi - lo || 1;
        const min = p.zeroBased ? 0 : lo - span * 0.15;
        const max = hi + span * 0.05;
        const w = (v: number) => ((v - min) / (max - min)) * 100;
        return (
          <div key={p.key}>
            <p className="mb-2 text-xs font-medium text-zinc-400 print:text-zinc-700">
              {p.title}
            </p>
            <ul className="space-y-1">
              {vals.map(({ d, v }) => (
                <li key={d.name} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2">
                  <span className="truncate text-[11px] text-zinc-400 print:text-zinc-700" title={d.name}>
                    {d.name}
                  </span>
                  <span className="h-2.5 rounded-sm bg-zinc-900 print:bg-zinc-100">
                    <span
                      className="block h-2.5 rounded-sm"
                      style={{
                        width: `${Math.max(2, w(v))}%`,
                        background: colorFor(d.slot),
                      }}
                      title={`${d.name}: ${p.fmt(v)}`}
                    />
                  </span>
                  <span className="text-right text-[11px] tabular-nums text-zinc-300 print:text-zinc-800">
                    {p.fmt(v)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The season trend, as small multiples — one panel per driver.
 *
 * Johann's version draws eleven lines on one frame, and past about four they
 * stop being readable: the palette has six slots, and a seventh driver would
 * either repeat a colour or invent one. One small panel per driver on a SHARED
 * y-scale keeps every driver distinguishable however many there are, and the
 * shared scale is what makes the panels comparable at a glance.
 */
function TrendChart({
  races,
  series,
}: {
  races: { planId: string; label: string; racedAtMs: number }[];
  series: { name: string; slot: number; values: (number | null)[] }[];
}) {
  const all = series.flatMap((s) =>
    s.values.filter((v): v is number => v != null && Number.isFinite(v))
  );
  if (all.length === 0)
    return <p className="text-xs text-zinc-600">Noch keine Werte in der Historie.</p>;

  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || 0.01) * 0.15;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const W = 240;
  const H = 64;
  const PADX = 6;
  const x = (i: number) =>
    races.length <= 1
      ? W / 2
      : PADX + (i / (races.length - 1)) * (W - PADX * 2);
  const y = (v: number) => H - 8 - ((v - yMin) / (yMax - yMin)) * (H - 16);

  const withData = series.filter((s) =>
    s.values.some((v) => v != null && Number.isFinite(v))
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
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
                  {last ? fmtPct(last.v, 2) : "—"}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="h-16 w-full"
                role="img"
                aria-label={`${s.name}: Verlauf über ${pts.length} Rennen`}
              >
                <line x1={0} y1={H - 8} x2={W} y2={H - 8} stroke={GRID} strokeWidth={1} />
                {pts.length > 1 && (
                  <path d={dPath} fill="none" stroke={colorFor(s.slot)} strokeWidth={2} />
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
                    <title>{`${races[p.i]?.label ?? ""}: ${fmtPct(p.v, 2)}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 print:text-zinc-600">
        Gleiche Skala in allen Feldern ({fmtPct(yMin, 1)} – {fmtPct(yMax, 1)}).
        Rennen von links nach rechts:{" "}
        <span style={{ color: AXIS }}>{races.map((r) => r.label).join(" · ")}</span>
      </p>
    </div>
  );
}
