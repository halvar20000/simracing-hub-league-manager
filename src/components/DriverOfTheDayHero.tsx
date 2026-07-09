/**
 * Public "Driver of the Day" hero window, shown near the top of a round page
 * once the round's DotD has been computed (and results are public). A
 * recognition badge — no championship points. See src/lib/driver-of-the-day.ts.
 */

type WinnerMetrics = {
  startPos: number | null;
  finishPos: number | null;
  worstPos: number | null;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
};

type Breakdown = {
  positionsGained: number;
  recovery: number;
  overtakes: number;
  clean: number;
};

type Weights = { pos: number; rec: number; ot: number; clean: number };

type RankingEntry = {
  rank: number;
  name: string;
  carNumber: string | null;
  carClassShortName: string | null;
  score: number;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
  eligible: boolean;
  blockedRepeat: boolean;
  why: string;
};

type ClassWinner = {
  carClassShortName: string;
  winnerName: string;
  winnerCarNumber: string | null;
  score: number;
};

export type DriverOfTheDayHeroData = {
  winnerName: string;
  winnerCarNumber: string | null;
  score: number;
  breakdown: unknown;
  winnerMetrics: unknown;
  ranking: unknown;
  classWinners: unknown;
  weights: unknown;
  previousWinnerName: string | null;
  previousWinnerBlocked: boolean;
};

// Build the winner's one-line summary, null-safe for combined multi-race rounds
// (which carry no single start/finish/worst position).
function metricsSummary(m: WinnerMetrics): string {
  const parts: string[] = [];
  if (m.positionsGained > 0) {
    const arc = m.startPos != null && m.finishPos != null ? ` (P${m.startPos}→P${m.finishPos})` : "";
    parts.push(`Gained ${m.positionsGained}${arc}`);
  }
  if (m.recovery > 0) {
    parts.push(`recovered ${m.recovery}${m.worstPos != null ? ` from P${m.worstPos}` : ""}`);
  }
  if (m.overtakes > 0) parts.push(`${m.overtakes} overtakes`);
  parts.push(`${m.incidents} inc`);
  return parts.join(" · ");
}

export function DriverOfTheDayHero({ dotd }: { dotd: DriverOfTheDayHeroData }) {
  const metrics = dotd.winnerMetrics as WinnerMetrics | null;
  const breakdown = dotd.breakdown as Breakdown | null;
  const weights = (dotd.weights as Weights | null) ?? { pos: 0.4, rec: 0.2, ot: 0.25, clean: 0.15 };
  const ranking = (dotd.ranking as RankingEntry[] | null) ?? [];
  const classWinners = (dotd.classWinners as ClassWinner[] | null) ?? [];

  // Runners-up: the next eligible drivers below the winner (rank 2+).
  const runnersUp = ranking.filter((r) => r.eligible && r.rank > 1).slice(0, 3);

  const bars: { label: string; value: number; weight: number }[] = breakdown
    ? [
        { label: "Positions gained", value: breakdown.positionsGained, weight: weights.pos },
        { label: "Overtakes", value: breakdown.overtakes, weight: weights.ot },
        { label: "Recovery", value: breakdown.recovery, weight: weights.rec },
        { label: "Clean racing", value: breakdown.clean, weight: weights.clean },
      ]
    : [];

  return (
    <section className="overflow-hidden rounded-lg border border-amber-700/40 bg-gradient-to-br from-amber-950/30 via-zinc-900 to-zinc-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            🏆 Driver of the Day
          </div>
          <h2 className="mt-1 text-2xl font-bold leading-tight text-zinc-100">
            {dotd.winnerCarNumber ? (
              <span className="text-amber-300">#{dotd.winnerCarNumber} </span>
            ) : null}
            {dotd.winnerName}
          </h2>
          {metrics && (
            <p className="mt-1 text-sm text-zinc-300">{metricsSummary(metrics)}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Merit score</div>
          <div className="text-2xl font-bold tabular-nums text-amber-200">
            {dotd.score.toFixed(3)}
          </div>
        </div>
      </div>

      {bars.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {bars.map((b) => {
            const pct = b.weight > 0 ? Math.max(0, Math.min(100, (b.value / b.weight) * 100)) : 0;
            return (
              <div key={b.label}>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{b.label}</span>
                  <span className="tabular-nums text-zinc-500">{b.value.toFixed(2)}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full rounded bg-amber-500/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {classWinners.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Per class
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {classWinners.map((cw) => (
              <div
                key={cw.carClassShortName}
                className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                  {cw.carClassShortName}
                </span>{" "}
                <span className="text-zinc-200">
                  {cw.winnerCarNumber ? `#${cw.winnerCarNumber} ` : ""}
                  {cw.winnerName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {runnersUp.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Also outstanding
          </div>
          <ul className="space-y-1 text-sm text-zinc-300">
            {runnersUp.map((r) => (
              <li key={`${r.rank}-${r.name}`} className="flex items-baseline gap-2">
                <span className="tabular-nums text-zinc-500">{r.rank}.</span>
                <span className="font-medium text-zinc-200">
                  {r.carNumber ? `#${r.carNumber} ` : ""}
                  {r.name}
                </span>
                <span className="text-xs text-zinc-500">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dotd.previousWinnerBlocked && dotd.previousWinnerName && (
        <p className="mt-4 text-xs italic text-cyan-300/90">
          {dotd.previousWinnerName} won the previous round and is not eligible for a
          back-to-back Driver of the Day.
        </p>
      )}

      <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
        Driver of the Day blends positions gained, overtakes, recovery and clean racing — so
        it rewards the best drive through the field, not simply the race winner. Recognition
        only; it awards no championship points.
      </p>
    </section>
  );
}
