"use client";

import type { DriverStats } from "@/lib/team-stats";
import { fmtLap, fmtPct } from "@/lib/debrief";

/**
 * One driver, everything the history holds.
 *
 * The question somebody actually has when they open a driver's page is "how is
 * he doing, and compared with whom" — so the ranks come first, then the race
 * by race table the ranks are made of, then the patterns that only show up
 * across a season.
 */

const ACCENT = "#3987e5";
const GOOD = "#199e70";
const BAD = "#d95926";
const GRID = "#27272a";

const card =
  "rounded-lg border border-zinc-800 bg-zinc-950 p-4 print:border-zinc-300 print:bg-white";
const h2 =
  "mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300 print:text-zinc-900";
const th =
  "border-b border-zinc-800 px-2 py-1.5 text-left font-medium text-zinc-400 print:border-zinc-300 print:text-zinc-700";
const td = "px-2 py-1.5 text-zinc-200 print:text-zinc-900";

const fmtNum = (x: number | null, d = 2) =>
  x == null || !Number.isFinite(x) ? "—" : x.toFixed(d).replace(".", ",");
const fmtDelta = (sec: number | null) =>
  sec == null || !Number.isFinite(sec)
    ? "—"
    : `${sec >= 0 ? "+" : "−"}${Math.abs(sec).toFixed(3).replace(".", ",")}`;

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

export type DriverStatsProp = Omit<DriverStats, "races" | "stints"> & {
  races: (Omit<DriverStats["races"][number], "racedAt"> & {
    racedAt: Date;
    racedAtMs: number;
  })[];
  stints: (Omit<DriverStats["stints"][number], "racedAt"> & {
    racedAt: Date;
    racedAtMs: number;
  })[];
};

export default function DriverStatsView({ stats }: { stats: DriverStatsProp }) {
  const t = stats.totals;
  const hasG61 = stats.races.some((r) => r.g61MedianSec != null);

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{stats.name}</h1>
          <p className="text-sm text-zinc-400 print:text-zinc-600">
            {stats.groupName} · {t.races}{" "}
            {t.races === 1 ? "ausgewertetes Rennen" : "ausgewertete Rennen"}
            {t.iRatingLast != null && ` · iRating ${t.iRatingLast}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {stats.iracingMemberId && (
            <a
              href={`/drivers/${stats.iracingMemberId}`}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Liga-Karriere ansehen →
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Drucken / PDF
          </button>
        </div>
      </div>

      {/* ---- where he stands in the team -------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Im Team</h2>
        {stats.ranks.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Noch keine vergleichbaren Kennzahlen im Team.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.ranks.map((r) => {
              const good = r.rank === 1;
              const fmt =
                r.metric === "incPerHour"
                  ? (x: number | null) => fmtNum(x, 2)
                  : r.metric === "bestGapToTeam"
                    ? (x: number | null) =>
                        x == null ? "—" : x === 0 ? "schnellste" : `+${fmtNum(x, 3)} s`
                    : (x: number | null) => fmtPct(x, 2);
              return (
                <div
                  key={r.metric}
                  className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 print:border-zinc-300 print:bg-white"
                >
                  <p className="text-[11px] text-zinc-400 print:text-zinc-600">
                    {r.label}
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-2">
                    <span
                      className="text-2xl font-bold tabular-nums"
                      style={{ color: good ? GOOD : undefined }}
                    >
                      {r.rank}.
                    </span>
                    <span className="text-xs text-zinc-500">von {r.of}</span>
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-zinc-300 print:text-zinc-800">
                    {fmt(r.value)}
                    <span className="ml-2 text-zinc-500">
                      Team Ø {fmt(r.teamMean)}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-zinc-500 print:text-zinc-600">
          Verglichen wird nur mit den Teamkollegen, die dieselbe Kennzahl haben —
          steht „von 3" da, hatten drei Fahrer sie, nicht das ganze Team.
        </p>
      </section>

      {/* ---- career totals ---------------------------------------------- */}
      <section className={card}>
        <h2 className={h2}>Über alle Rennen</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Rennen" value={String(t.races)} />
          <Stat label="Runden" value={t.laps ? String(t.laps) : "—"} />
          <Stat label="Fahrzeit" value={fmtDrive(t.driveSec)} />
          <Stat label="beste Runde" value={fmtLap(t.bestSec)} />
          <Stat label="Ø Relativperf." value={fmtPct(t.avgRelPerf, 2)} />
          <Stat label="Ø Konstanz" value={fmtPct(t.avgConsistency, 2)} />
          <Stat
            label="Ø Incidents/h"
            value={fmtNum(t.avgIncPerHour, 2)}
          />
        </div>
      </section>

      {/* ---- race by race ------------------------------------------------ */}
      <section className={card}>
        <h2 className={h2}>Rennen für Rennen</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead>
              <tr>
                <th className={th}>Rennen</th>
                <th className={`${th} text-right`}>Datum</th>
                <th className={`${th} text-right`}>iRating</th>
                <th className={`${th} text-right`}>Ø gesamt</th>
                <th className={`${th} text-right`}>Ø clean</th>
                <th className={`${th} text-right`}>Prognose</th>
                <th className={`${th} text-right`}>beste Runde</th>
                <th className={`${th} text-right`}>Referenz</th>
                <th className={`${th} text-right`}>Relativperf.</th>
                <th className={`${th} text-right`}>10k</th>
                <th className={`${th} text-right`}>Konstanz</th>
                <th className={`${th} text-right`}>Incs/h</th>
                <th className={`${th} text-right`}>Runden</th>
                <th className={`${th} text-right`}>Stints</th>
              </tr>
            </thead>
            <tbody>
              {stats.races.map((r) => (
                <tr
                  key={r.sourceKey}
                  className="border-b border-zinc-900 last:border-0 print:border-zinc-200"
                >
                  <td className={`${td} whitespace-nowrap`}>
                    {r.raceTitle}
                    {r.source === "import" && (
                      <span className="ml-1 text-zinc-600" title="aus der Team-Tabelle übernommen">
                        †
                      </span>
                    )}
                    {r.track && (
                      <span className="block text-[10px] text-zinc-500">{r.track}</span>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                    {fmtDate(r.racedAtMs)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.iRating ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.avgAllSec)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.avgCleanSec)}</td>
                  <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                    {fmtLap(r.planSec)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLap(r.bestSec)}</td>
                  <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                    {fmtLap(r.refIRatingSec)}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtPct(r.relPerf, 2)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtPct(r.perf10k, 2)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtPct(r.consistency, 2)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtNum(r.incPerHour, 2)}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.laps ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.stints ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- iRating against relative performance ------------------------ */}
      {stats.races.filter((r) => r.iRating != null).length >= 2 && (
        <section className={card}>
          <h2 className={h2}>iRating und Relativperformance</h2>
          <TwoLine
            labels={stats.races.map((r) => r.raceTitle)}
            a={{
              name: "iRating",
              values: stats.races.map((r) => r.iRating),
              fmt: (v) => String(Math.round(v)),
              color: "#71717a",
            }}
            b={{
              name: "Relativperformance",
              values: stats.races.map((r) => r.relPerf ?? r.perf10k),
              fmt: (v) => fmtPct(v, 2),
              color: ACCENT,
            }}
          />
          <p className="mt-2 text-[11px] text-zinc-500 print:text-zinc-600">
            Zwei getrennte Felder mit eigener Skala, absichtlich nicht
            übereinandergelegt: zwei Grössen in einem Rahmen sehen vergleichbar
            aus, obwohl sie es nicht sind. Die Frage, die sie zusammen
            beantworten: hält er seine Relativperformance, während das Rating
            steigt?
          </p>
        </section>
      )}

      {/* ---- how the pace holds across a race ---------------------------- */}
      {stats.stints.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Über ein Rennen hinweg</h2>
          <StintPattern stints={stats.stints} />
        </section>
      )}

      {/* ---- practice against race --------------------------------------- */}
      {hasG61 && (
        <section className={card}>
          <h2 className={h2}>Training gegen Rennen</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr>
                  <th className={th}>Rennen</th>
                  <th className={`${th} text-right`}>Training Ø</th>
                  <th className={`${th} text-right`}>Training beste</th>
                  <th className={`${th} text-right`}>Rennen Ø clean</th>
                  <th className={`${th} text-right`}>Rennen beste</th>
                  <th className={`${th} text-right`}>Differenz Ø</th>
                  <th className={`${th} text-right`}>Runden Training</th>
                </tr>
              </thead>
              <tbody>
                {stats.races
                  .filter((r) => r.g61MedianSec != null)
                  .map((r) => {
                    const diff =
                      r.avgCleanSec != null && r.g61MedianSec != null
                        ? r.avgCleanSec - r.g61MedianSec
                        : null;
                    return (
                      <tr
                        key={r.sourceKey}
                        className="border-b border-zinc-900 last:border-0 print:border-zinc-200"
                      >
                        <td className={`${td} whitespace-nowrap`}>{r.raceTitle}</td>
                        <td className={`${td} text-right tabular-nums`}>{fmtLap(r.g61MedianSec)}</td>
                        <td className={`${td} text-right tabular-nums`}>{fmtLap(r.g61BestSec)}</td>
                        <td className={`${td} text-right tabular-nums`}>{fmtLap(r.avgCleanSec)}</td>
                        <td className={`${td} text-right tabular-nums`}>{fmtLap(r.bestSec)}</td>
                        <td
                          className={`${td} text-right tabular-nums`}
                          style={{ color: diff == null ? undefined : diff > 0 ? BAD : GOOD }}
                        >
                          {fmtDelta(diff)}
                        </td>
                        <td className={`${td} text-right tabular-nums text-zinc-400 print:text-zinc-600`}>
                          {r.g61Laps ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 print:text-zinc-600">
            Trainingszeiten aus dem Garage-61-Import des jeweiligen Plans, auf
            dieselbe Strecke und dasselbe Auto. Eine positive Differenz heisst:
            im Rennen langsamer als im Training — was normal ist, Verkehr und
            Zurückhaltung kosten Zeit. Interessant ist, wie gross der Abstand im
            Vergleich zu den Teamkollegen ausfällt.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 print:border-zinc-300 print:bg-white">
      <p className="text-[11px] text-zinc-400 print:text-zinc-600">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100 print:text-zinc-900">
        {value}
      </p>
    </div>
  );
}

/**
 * Two measures over the same races, each in its own frame.
 *
 * Never one frame with two y-axes: two scales on one plot make the lines look
 * comparable when nothing about them is, and that is the single most common
 * way a chart lies.
 */
function TwoLine({
  labels,
  a,
  b,
}: {
  labels: string[];
  a: { name: string; values: (number | null)[]; fmt: (v: number) => string; color: string };
  b: { name: string; values: (number | null)[]; fmt: (v: number) => string; color: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[a, b].map((s) => {
        const pts = s.values
          .map((v, i) => (v == null || !Number.isFinite(v) ? null : { i, v }))
          .filter((p): p is { i: number; v: number } => p != null);
        if (pts.length === 0)
          return (
            <div key={s.name}>
              <p className="mb-1 text-xs font-medium text-zinc-400">{s.name}</p>
              <p className="text-xs text-zinc-600">keine Werte</p>
            </div>
          );
        const lo = Math.min(...pts.map((p) => p.v));
        const hi = Math.max(...pts.map((p) => p.v));
        const pad = (hi - lo || Math.abs(hi) * 0.05 || 1) * 0.15;
        const W = 420;
        const H = 110;
        const x = (i: number) =>
          labels.length <= 1 ? W / 2 : 12 + (i / (labels.length - 1)) * (W - 24);
        const y = (v: number) =>
          H - 14 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 28);
        return (
          <div key={s.name}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-medium text-zinc-400 print:text-zinc-700">
                {s.name}
              </span>
              <span className="text-xs tabular-nums text-zinc-400 print:text-zinc-600">
                {s.fmt(pts[pts.length - 1].v)}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
                 aria-label={`${s.name} über ${pts.length} Rennen`}>
              <line x1={0} y1={H - 14} x2={W} y2={H - 14} stroke={GRID} strokeWidth={1} />
              <path
                d={pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
              />
              {pts.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} fill={s.color}
                        stroke="#09090b" strokeWidth={2}>
                  <title>{`${labels[p.i] ?? ""}: ${s.fmt(p.v)}`}</title>
                </circle>
              ))}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What only shows up across a whole season: does the pace hold from the first
 * stint of a race to the fourth, and does the night cost anything.
 *
 * Both are means of the gap to the plan's prognosis, which is the only figure
 * comparable across tracks — a raw lap time from Spa and one from Sebring
 * cannot be averaged together, and doing it anyway is how a "statistic" ends
 * up saying nothing.
 */
function StintPattern({ stints }: { stints: DriverStatsProp["stints"] }) {
  const withDelta = stints.filter((s) => s.deltaSec != null);

  const byOwn = new Map<number, number[]>();
  for (const s of withDelta) {
    const arr = byOwn.get(s.ownIndex) ?? [];
    arr.push(s.deltaSec as number);
    byOwn.set(s.ownIndex, arr);
  }
  const ownRows = Array.from(byOwn.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([n, xs]) => ({
      n,
      mean: xs.reduce((a, b) => a + b, 0) / xs.length,
      count: xs.length,
    }));

  const NIGHT = (h: number) => h >= 23 || h < 6;
  const withHour = withDelta.filter((s) => s.startHour != null);
  const night = withHour.filter((s) => NIGHT(s.startHour as number));
  const day = withHour.filter((s) => !NIGHT(s.startHour as number));
  const meanOf = (xs: typeof withDelta) =>
    xs.length
      ? xs.reduce((a, b) => a + (b.deltaSec as number), 0) / xs.length
      : null;

  if (ownRows.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Für die Stints dieses Fahrers gibt es noch keine Prognose aus einem
        Plan, deshalb lässt sich der Verlauf über ein Rennen nicht vergleichen.
      </p>
    );

  const span = Math.max(...ownRows.map((r) => Math.abs(r.mean)), 0.5);
  const W = 520;
  const H = 26 * ownRows.length + 24;
  const mid = W / 2;
  const bar = (v: number) => (v / span) * (W / 2 - 60);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400 print:text-zinc-700">
          Abweichung zur Prognose je Stintnummer im Rennen
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
             aria-label="Abweichung zur Prognose je Stintnummer">
          <line x1={mid} y1={0} x2={mid} y2={H - 18} stroke={GRID} strokeWidth={1} />
          {ownRows.map((r, i) => {
            const w = bar(r.mean);
            return (
              <g key={r.n}>
                <text x={4} y={26 * i + 17} fontSize={11} fill="#a1a1aa">
                  {r.n}. Stint
                </text>
                <rect
                  x={w >= 0 ? mid : mid + w}
                  y={26 * i + 5}
                  width={Math.max(1.5, Math.abs(w))}
                  height={14}
                  rx={2}
                  fill={r.mean > 0 ? BAD : GOOD}
                >
                  <title>{`${r.n}. Stint: ${fmtDelta(r.mean)} s/Runde über ${r.count} ${
                    r.count === 1 ? "Stint" : "Stints"
                  }`}</title>
                </rect>
                <text
                  x={w >= 0 ? mid + Math.abs(w) + 6 : mid - Math.abs(w) - 6}
                  y={26 * i + 17}
                  fontSize={10}
                  fill="#d4d4d8"
                  textAnchor={w >= 0 ? "start" : "end"}
                >
                  {fmtDelta(r.mean)}
                </text>
              </g>
            );
          })}
          <text x={4} y={H - 4} fontSize={10} fill="#71717a">
            ← schneller als geplant
          </text>
          <text x={W - 4} y={H - 4} fontSize={10} fill="#71717a" textAnchor="end">
            langsamer als geplant →
          </text>
        </svg>
        <p className="mt-1 text-[11px] text-zinc-500 print:text-zinc-600">
          Gemittelt über alle Rennen. „3. Stint" heisst der dritte Stint DIESES
          Fahrers im jeweiligen Rennen, nicht der dritte des Autos.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400 print:text-zinc-700">
          Tag gegen Nacht
        </p>
        {withHour.length === 0 ? (
          <p className="text-xs text-zinc-600">
            Keiner der Pläne trägt eine Startzeit, deshalb lässt sich nicht
            sagen, wann ein Stint gefahren wurde.
          </p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b border-zinc-900 print:border-zinc-200">
                <td className={td}>Tag (6–23 Uhr)</td>
                <td className={`${td} text-right tabular-nums`}>{day.length} Stints</td>
                <td className={`${td} text-right tabular-nums`}>{fmtDelta(meanOf(day))}</td>
              </tr>
              <tr>
                <td className={td}>Nacht (23–6 Uhr)</td>
                <td className={`${td} text-right tabular-nums`}>{night.length} Stints</td>
                <td className={`${td} text-right tabular-nums`}>{fmtDelta(meanOf(night))}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[11px] text-zinc-500 print:text-zinc-600">
          Ebenfalls als Abweichung zur Prognose, weil sich nur die über
          verschiedene Strecken mitteln lässt. Bei wenigen Nachtstints sagt der
          Wert noch nichts — die Anzahl steht bewusst daneben.
        </p>
      </div>
    </div>
  );
}
