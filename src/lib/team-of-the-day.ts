/**
 * Team of the Day — the team counterpart to Driver of the Day.
 *
 * Deliberately built differently from `driver-of-the-day.ts`: that one ingests
 * uploaded race-logger files, needs its own table and carries the
 * no-back-to-back rule. This one is a pure function over the TeamResult rows
 * the round already has, computed on every page render. That means it can
 * never drift from the result — correct a position (as after the Sebring race
 * control failure) and the award follows automatically, with nothing to
 * recompute and nothing to archive.
 *
 * Three criteria, chosen with the league (2026-09-06). All of them are team
 * qualities over a long race rather than one driver's stint:
 *
 *   • progress    — class position at the start vs. at the finish. The start
 *                   rank is derived WITHIN the class from the grid slots, so a
 *                   GT3 car is never measured against the LMP2 grid.
 *   • clean       — incidents per lap, relative to the cleanest car in the
 *                   class. Three hours without contact is teamwork.
 *   • reliability — distance covered against the class winner, and whether the
 *                   car was still classified at the end.
 *
 * Ranked per car class; a class with fewer than two cars gets no award, since
 * "best of one" says nothing.
 */

export type TotdInput = {
  teamId: string;
  teamName: string;
  carClassId: string | null;
  carClassName: string;
  carClassShortCode: string;
  /** Overall grid slot; ranked within the class by this module. */
  startPosition: number | null;
  classPosition: number | null;
  lapsCompleted: number;
  totalIncidents: number;
  /** CLASSIFIED / DNF / DNS / DSQ as stored on the result row. */
  finishStatus: string;
};

export type TotdScore = {
  teamId: string;
  teamName: string;
  carClassShortCode: string;
  carClassName: string;
  /** 0..1, weighted total. */
  score: number;
  /** Already weighted, so the parts add up to `score`. */
  breakdown: { progress: number; clean: number; reliability: number };
  metrics: {
    classStartPosition: number | null;
    classFinishPosition: number | null;
    placesGained: number | null;
    laps: number;
    incidents: number;
    incidentsPerLap: number | null;
    classified: boolean;
  };
  /** One sentence naming what actually earned it, for the page. */
  reason: string;
};

export type TotdResult = {
  /** One winner per class, classes with a single entry omitted. */
  winners: TotdScore[];
  /** Full ranking per class, best first — feeds the "also strong" list. */
  ranking: Record<string, TotdScore[]>;
};

export const TOTD_WEIGHTS = { progress: 0.4, clean: 0.35, reliability: 0.25 } as const;

/** Smallest class size that makes an award meaningful. */
export const TOTD_MIN_CARS = 2;

function classRankByGrid(rows: TotdInput[]): Map<string, number | null> {
  // Cars without a grid slot keep null rather than being pushed to the back —
  // a missing slot is unknown, not last.
  const withSlot = rows
    .filter((r) => r.startPosition != null && r.startPosition > 0)
    .sort((a, b) => (a.startPosition as number) - (b.startPosition as number));
  const out = new Map<string, number | null>();
  rows.forEach((r) => out.set(r.teamId, null));
  withSlot.forEach((r, i) => out.set(r.teamId, i + 1));
  return out;
}

function norm(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  // No spread in the class — the criterion cannot tell these cars apart, so it
  // stays neutral instead of handing everyone a full mark. Full marks here used
  // to hand the whole progress weight to a car that had LOST places, whenever
  // it was the only one with a known grid slot.
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function computeTeamOfTheDay(rows: TotdInput[]): TotdResult {
  const byClass = new Map<string, TotdInput[]>();
  for (const r of rows) {
    const key = r.carClassShortCode || "—";
    const list = byClass.get(key);
    if (list) list.push(r);
    else byClass.set(key, [r]);
  }

  const ranking: Record<string, TotdScore[]> = {};
  const winners: TotdScore[] = [];

  for (const [code, list] of byClass) {
    const gridRank = classRankByGrid(list);
    const maxLaps = Math.max(...list.map((r) => r.lapsCompleted), 0);

    // Raw values first, so each criterion can be normalised across the class.
    const raw = list.map((r) => {
      const start = gridRank.get(r.teamId) ?? null;
      const finish = r.classPosition ?? null;
      const gained = start != null && finish != null ? start - finish : null;
      const ipl = r.lapsCompleted > 0 ? r.totalIncidents / r.lapsCompleted : null;
      const classified = r.finishStatus === "CLASSIFIED";
      return { r, start, finish, gained, ipl, classified };
    });

    const gains = raw.map((x) => x.gained).filter((v): v is number => v != null);
    const minGain = gains.length ? Math.min(...gains) : 0;
    const maxGain = gains.length ? Math.max(...gains) : 0;
    const ipls = raw.map((x) => x.ipl).filter((v): v is number => v != null);
    const minIpl = ipls.length ? Math.min(...ipls) : 0;
    const maxIpl = ipls.length ? Math.max(...ipls) : 0;

    const scored: TotdScore[] = raw.map((x) => {
      // Progress: only cars with a known grid slot can earn it.
      const progress = x.gained == null ? 0 : norm(x.gained, minGain, maxGain);
      // Clean: fewer incidents per lap is better, so the scale is inverted.
      // A car that never completed a lap cannot claim to have been clean.
      const clean = x.ipl == null ? 0 : 1 - norm(x.ipl, minIpl, maxIpl);
      // Reliability: distance plus actually being classified at the end.
      const distance = maxLaps > 0 ? x.r.lapsCompleted / maxLaps : 0;
      const reliability = distance * (x.classified ? 1 : 0.5);

      const breakdown = {
        progress: progress * TOTD_WEIGHTS.progress,
        clean: clean * TOTD_WEIGHTS.clean,
        reliability: reliability * TOTD_WEIGHTS.reliability,
      };
      const score = breakdown.progress + breakdown.clean + breakdown.reliability;

      const parts: string[] = [];
      if (x.gained != null && x.gained > 0) parts.push(`${x.gained} Plätze gutgemacht`);
      if (x.ipl != null && x.ipl === minIpl && ipls.length > 1)
        parts.push(`sauberstes Auto der Klasse (${x.r.totalIncidents} Incidents)`);
      else if (x.ipl != null && x.ipl <= minIpl * 1.5)
        parts.push(`nur ${x.r.totalIncidents} Incidents`);
      if (x.r.lapsCompleted === maxLaps && maxLaps > 0) parts.push("volle Distanz");
      if (!x.classified) parts.push("nicht gewertet");

      return {
        teamId: x.r.teamId,
        teamName: x.r.teamName,
        carClassShortCode: code,
        carClassName: x.r.carClassName,
        score,
        breakdown,
        metrics: {
          classStartPosition: x.start,
          classFinishPosition: x.finish,
          placesGained: x.gained,
          laps: x.r.lapsCompleted,
          incidents: x.r.totalIncidents,
          incidentsPerLap: x.ipl,
          classified: x.classified,
        },
        reason: parts.length ? parts.join(", ") : "gleichmäßiges Rennen ohne Auffälligkeiten",
      };
    });

    scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.metrics.incidents - b.metrics.incidents ||
        (a.metrics.classFinishPosition ?? 99) - (b.metrics.classFinishPosition ?? 99)
    );
    ranking[code] = scored;
    if (list.length >= TOTD_MIN_CARS && scored.length > 0) winners.push(scored[0]);
  }

  winners.sort((a, b) => b.score - a.score);
  return { winners, ranking };
}
