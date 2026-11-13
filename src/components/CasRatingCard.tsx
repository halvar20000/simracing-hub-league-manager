/**
 * The CAS Rating licence card (design from the regulation page): name, CR,
 * change since the last race, performance / attendance / races, leagues.
 * Pure server component.
 */
import { round1 } from "@/lib/cas-rating";

export const fmtCr = (v: number) =>
  round1(v).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function initials(name: string): string {
  const parts = name.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function CasRatingCard({
  name,
  image,
  rating,
  delta,
  performance,
  attendance,
  races,
  leagues,
}: {
  name: string;
  image?: string | null;
  rating: number;
  delta: number | null;
  performance: number;
  attendance: number;
  races: number;
  leagues: string[];
}) {
  return (
    <div className="relative w-full max-w-[300px] rounded-[22px] bg-gradient-to-br from-[#3a3d47] to-[#23252c] p-3.5 shadow-2xl shadow-black/60">
      <div className="absolute left-1/2 top-2.5 h-2 w-14 -translate-x-1/2 rounded bg-[#0a0a0f]" />
      <div className="rounded-[14px] border border-[#33363f] bg-gradient-to-b from-[#1b1d24] to-[#121318] px-4 pb-4 pt-8 text-center">
        <div className="text-xs font-bold tracking-[0.14em] text-[#ff6b35]">CAS LEAGUE RATING</div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="mx-auto mb-2.5 mt-4 h-24 w-24 rounded-full border-[3px] border-[#2c2f38] object-cover"
          />
        ) : (
          <div className="mx-auto mb-2.5 mt-4 flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-[#2c2f38] bg-[radial-gradient(circle_at_35%_30%,#5865f2,#2b2f8f)] text-3xl font-bold text-white">
            {initials(name)}
          </div>
        )}
        <div className="text-2xl font-extrabold text-white">{name}</div>
        <div className="mb-1 mt-2.5 inline-flex items-baseline gap-2.5 rounded-full border-[1.5px] border-[#ff6b35] px-4 py-1">
          <small className="text-xs font-bold tracking-widest text-[#ff6b35]">CR</small>
          <b className="text-2xl tabular-nums text-white">{fmtCr(rating)}</b>
        </div>
        <div
          className={`text-sm ${
            delta == null || Math.abs(delta) < 0.05 ? "text-zinc-500" : delta > 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {delta == null
            ? "No race counted yet"
            : Math.abs(delta) < 0.05
              ? "± 0.0 since last race"
              : `${delta > 0 ? "▲" : "▼"} ${fmtCr(Math.abs(delta))} since last race`}
        </div>
        <div className="mt-2.5 flex justify-center gap-4 text-xs text-zinc-400">
          <div>
            <b className="block text-base tabular-nums text-white">{fmtCr(performance)}</b>Performance
          </div>
          <div>
            <b className="block text-base tabular-nums text-white">{Math.round(attendance)} %</b>Attendance
          </div>
          <div>
            <b className="block text-base tabular-nums text-white">{races}</b>Races
          </div>
        </div>
        {leagues.length > 0 && (
          <div className="mt-4 border-t border-[#2c2f38] pt-2.5 text-[11px] uppercase tracking-[0.12em] text-[#7d808a]">
            {leagues.join(" · ")}
          </div>
        )}
        <div className="mt-2.5 font-black tracking-wider text-white">
          CAS <span className="text-[#ff6b35]">COMMUNITY</span>
        </div>
      </div>
    </div>
  );
}

/** CR curve over time. `points` oldest first. */
export function CasRatingChart({ points }: { points: { at: Date; rating: number }[] }) {
  const W = 640;
  const H = 220;
  const L = 34;
  const R = 606;
  const T = 24;
  const B = 186;
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        The curve starts after your first counted race. Until then everybody is at 50.
      </p>
    );
  }
  const values = points.map((p) => p.rating);
  let lo = Math.floor((Math.min(...values) - 5) / 10) * 10;
  let hi = Math.ceil((Math.max(...values) + 5) / 10) * 10;
  lo = Math.max(0, lo);
  hi = Math.min(100, Math.max(hi, lo + 20));
  const y = (v: number) => B - ((v - lo) * (B - T)) / (hi - lo);
  const x = (i: number) => L + (i * (R - L)) / (points.length - 1);
  const grid: number[] = [];
  for (let g = lo; g <= hi; g += 10) grid.push(g);
  const poly = points.map((p, i) => `${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="CAS Rating over time">
      {grid.map((g) => (
        <g key={g}>
          <line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="#2a2a33" />
          <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#8a8f98">
            {g}
          </text>
        </g>
      ))}
      <polyline points={poly} fill="none" stroke="#ff6b35" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.rating)} r={4.5} fill="#ff6b35" />
      <text x={L} y={H - 10} fontSize={11} fill="#8a8f98">
        {fmtDay(points[0].at)}
      </text>
      <text x={R} y={H - 10} fontSize={11} fill="#8a8f98" textAnchor="end">
        {fmtDay(last.at)}
      </text>
    </svg>
  );
}
