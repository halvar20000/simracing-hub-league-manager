/**
 * Driver of the Day — scoring engine (pure, no DB, no "use server").
 *
 * Direct TypeScript port of driver_of_the_day.py from the iRacing-overlays
 * project, validated there against historical CAS race logs. CLS improves on
 * the Python in one way: the start / finish / incident numbers come from the
 * authoritative iRacing eventresult JSON instead of the log-derived lap-1
 * proxy. The log still supplies overtakes + the worst position reached (for the
 * recovery metric), which eventresult does not contain.
 *
 * The award blends four merits, each min-max normalised across the eligible
 * field then weighted and summed:
 *
 *   • positions gained  (start − finish)            — heaviest (0.40)
 *   • recovery          (worst position − finish)   — 0.20
 *   • overtakes         (on-track passes)           — 0.25
 *   • clean racing      (fewer incidents = better)  — 0.15
 *
 * The winner is deliberately NOT the race winner by default: a clean pole-to-
 * flag victory scores ~0 on gained / recovery / overtakes, so the driver who
 * carved through the field wins instead. The race winner stays *eligible* and
 * takes it only when genuinely earned (e.g. won from deep in the grid).
 *
 * No points are ever awarded — this is a recognition badge only.
 */

export type DotdWeights = {
  pos: number;
  rec: number;
  ot: number;
  clean: number;
};

export const WEIGHT_PROFILES: Record<string, DotdWeights> = {
  positions: { pos: 0.4, rec: 0.2, ot: 0.25, clean: 0.15 },
  balanced: { pos: 0.3, rec: 0.25, ot: 0.25, clean: 0.2 },
  recovery: { pos: 0.25, rec: 0.4, ot: 0.2, clean: 0.15 },
  clean: { pos: 0.2, rec: 0.15, ot: 0.35, clean: 0.3 },
};

export const DEFAULT_PROFILE = "positions";
export const MIN_LAPS_FRACTION = 0.5;

export type DotdFinishStatus = "CLASSIFIED" | "DNF" | "DNS" | "DSQ";

/**
 * One driver, already joined from the eventresult row (start/finish/incidents/
 * identity) and the race-logger row (overtakes/worst position) by the caller.
 */
export interface DotdCandidate {
  custId: number | null;
  userId: string | null;
  name: string;
  carNumber: string | null;
  carClassShortName: string | null;
  /** 1-based grid position from eventresult. */
  startPos: number | null;
  /** 1-based finish position from eventresult. */
  finishPos: number | null;
  /** Worst (max) track position from the log; falls back to finishPos. */
  worstPos: number | null;
  /** On-track passes from the log's counter. */
  overtakes: number;
  /** Incident count from eventresult. */
  incidents: number;
  /** Laps completed from eventresult. */
  lapsCompleted: number;
  finishStatus: DotdFinishStatus;
}

export interface DotdComponents {
  positionsGained: number;
  recovery: number;
  overtakes: number;
  clean: number;
}

export interface DotdRow {
  custId: number | null;
  userId: string | null;
  name: string;
  carNumber: string | null;
  carClassShortName: string | null;
  startPos: number | null;
  finishPos: number | null;
  worstPos: number | null;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
  lapsCompleted: number;
  finished: boolean;
  eligible: boolean;
  blockedRepeat: boolean;
  ineligibleReasons: string[];
  norm: DotdComponents;
  components: DotdComponents;
  score: number;
  why: string;
}

export interface DotdResult {
  ok: boolean;
  error: string | null;
  weightsProfile: string;
  weights: DotdWeights;
  winner: DotdRow | null;
  drivers: DotdRow[];
  /** userIds that were ranked but blocked from the crown (no back-to-back). */
  excludedUserIds: string[];
  meta: { nDrivers: number; leaderLaps: number };
}

export interface DotdOptions {
  profile?: string;
  weights?: Partial<DotdWeights> | null;
  minLapsFraction?: number;
  dnfCanWin?: boolean;
  /** CLS user IDs blocked from winning (previous round's winner). */
  excludeUserIds?: Iterable<string>;
  /** Display names blocked from winning (fallback when no userId match). */
  excludeNames?: Iterable<string>;
}

function minmaxNorm(values: number[]): number[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Compute Driver of the Day for one field of candidates. Used both for the
 * overall award and, on multiclass seasons, per car class (call once per
 * class with that class's candidates).
 */
export function computeDriverOfTheDay(
  candidates: DotdCandidate[],
  opts: DotdOptions = {}
): DotdResult {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const base = WEIGHT_PROFILES[profile] ?? WEIGHT_PROFILES[DEFAULT_PROFILE];
  let weights: DotdWeights = { ...base, ...(opts.weights ?? {}) };
  const wsum = weights.pos + weights.rec + weights.ot + weights.clean || 1;
  weights = {
    pos: weights.pos / wsum,
    rec: weights.rec / wsum,
    ot: weights.ot / wsum,
    clean: weights.clean / wsum,
  };

  const minLapsFraction = opts.minLapsFraction ?? MIN_LAPS_FRACTION;
  const dnfCanWin = opts.dnfCanWin ?? false;
  const blockedUserIds = new Set<string>(opts.excludeUserIds ?? []);
  const blockedNames = new Set<string>(
    [...(opts.excludeNames ?? [])].map((n) => normalizeName(n)).filter(Boolean)
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "no classified drivers found",
      weightsProfile: profile,
      weights,
      winner: null,
      drivers: [],
      excludedUserIds: [],
      meta: { nDrivers: 0, leaderLaps: 0 },
    };
  }

  const leaderLaps = candidates.reduce((m, c) => Math.max(m, c.lapsCompleted), 0);
  const minLaps = leaderLaps * minLapsFraction;

  const rows: DotdRow[] = candidates.map((c) => {
    const startPos = c.startPos;
    const finishPos = c.finishPos;
    const worstPos = c.worstPos ?? finishPos;

    const positionsGained = startPos != null && finishPos != null ? startPos - finishPos : 0;
    const recovery =
      worstPos != null && finishPos != null ? Math.max(0, worstPos - finishPos) : 0;

    const finished = c.finishStatus === "CLASSIFIED";
    const reasons: string[] = [];
    let eligible = true;
    let blockedRepeat = false;

    if (c.lapsCompleted < minLaps) {
      eligible = false;
      reasons.push(`did not complete ${Math.round(minLapsFraction * 100)}% of leader's distance`);
    }
    if (!finished && !dnfCanWin) {
      eligible = false;
      reasons.push(`did not finish (${c.finishStatus})`);
    }
    const nameBlocked = blockedNames.has(normalizeName(c.name));
    const idBlocked = c.userId != null && blockedUserIds.has(c.userId);
    if (nameBlocked || idBlocked) {
      eligible = false;
      blockedRepeat = true;
      reasons.push("won the previous round (no back-to-back)");
    }

    return {
      custId: c.custId,
      userId: c.userId,
      name: c.name,
      carNumber: c.carNumber,
      carClassShortName: c.carClassShortName,
      startPos,
      finishPos,
      worstPos,
      positionsGained,
      recovery,
      overtakes: c.overtakes,
      incidents: c.incidents,
      lapsCompleted: c.lapsCompleted,
      finished,
      eligible,
      blockedRepeat,
      ineligibleReasons: reasons,
      norm: { positionsGained: 0, recovery: 0, overtakes: 0, clean: 0 },
      components: { positionsGained: 0, recovery: 0, overtakes: 0, clean: 0 },
      score: 0,
      why: "",
    };
  });

  // Normalise across the ELIGIBLE pool only (so a parked car can't stretch the
  // scale), then score everyone on that scale — ineligible drivers clamped.
  const pool = rows.filter((r) => r.eligible);
  const scalePool = pool.length > 0 ? pool : rows;

  const normMap = (
    key: "positionsGained" | "recovery" | "overtakes" | "incidents",
    invert = false
  ): Map<DotdRow, number> => {
    const vals = scalePool.map((r) => r[key]);
    const normed = minmaxNorm(vals);
    const m = new Map<DotdRow, number>();
    scalePool.forEach((r, i) => m.set(r, normed[i]));
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 0;
    const out = new Map<DotdRow, number>();
    for (const r of rows) {
      let n: number;
      if (m.has(r)) {
        n = m.get(r) as number;
      } else if (hi - lo < 1e-9) {
        n = 0.5;
      } else {
        n = Math.max(0, Math.min(1, (r[key] - lo) / (hi - lo)));
      }
      out.set(r, invert ? 1 - n : n);
    }
    return out;
  };

  const nPos = normMap("positionsGained");
  const nRec = normMap("recovery");
  const nOt = normMap("overtakes");
  const nClean = normMap("incidents", true);

  for (const r of rows) {
    const np = nPos.get(r) ?? 0;
    const nr = nRec.get(r) ?? 0;
    const no = nOt.get(r) ?? 0;
    const nc = nClean.get(r) ?? 0;
    const cPos = weights.pos * np;
    const cRec = weights.rec * nr;
    const cOt = weights.ot * no;
    const cClean = weights.clean * nc;
    r.norm = {
      positionsGained: round3(np),
      recovery: round3(nr),
      overtakes: round3(no),
      clean: round3(nc),
    };
    r.components = {
      positionsGained: round4(cPos),
      recovery: round4(cRec),
      overtakes: round4(cOt),
      clean: round4(cClean),
    };
    r.score = round4(cPos + cRec + cOt + cClean);
    r.why = why(r);
  }

  rows.sort((a, b) => b.score - a.score);
  const winner = rows.find((r) => r.eligible) ?? null;

  return {
    ok: true,
    error: null,
    weightsProfile: profile,
    weights,
    winner,
    drivers: rows,
    excludedUserIds: rows.filter((r) => r.blockedRepeat && r.userId).map((r) => r.userId as string),
    meta: { nDrivers: rows.length, leaderLaps },
  };
}

function why(r: DotdRow): string {
  const bits: string[] = [];
  if (r.positionsGained > 0) {
    bits.push(
      `gained ${r.positionsGained} position${r.positionsGained === 1 ? "" : "s"} (P${r.startPos}→P${r.finishPos})`
    );
  } else if (r.positionsGained < 0) {
    bits.push(`lost ${-r.positionsGained} (P${r.startPos}→P${r.finishPos})`);
  }
  if (r.recovery > 0) bits.push(`recovered ${r.recovery} from P${r.worstPos} low`);
  if (r.overtakes) bits.push(`${r.overtakes} overtake${r.overtakes === 1 ? "" : "s"}`);
  bits.push(`${r.incidents} incident${r.incidents === 1 ? "" : "s"}`);
  return bits.join(", ");
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
