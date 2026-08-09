import type {
  PrismaClient,
  FinishStatus,
} from "@prisma/client";

export interface PointsTable {
  [position: string]: number;
}

export interface FPRTier {
  max: number;
  points: number;
}

/**
 * Position points based on finish position and finish status.
 * Only CLASSIFIED finishes earn position points.
 */
export function calculateRawPoints(
  finishPosition: number,
  finishStatus: FinishStatus,
  raceDistancePct: number,
  racePointsMinDistancePct: number,
  pointsTable: PointsTable
): number {
  // DSQ and DNS never score.
  if (finishStatus === "DSQ" || finishStatus === "DNS") return 0;
  // Below the distance threshold: no position points.
  if (raceDistancePct < racePointsMinDistancePct) return 0;
  if (finishPosition < 1) return 0;
  return pointsTable[String(finishPosition)] ?? 0;
}

/**
 * Participation points if driver finished at least the minimum %
 * of race distance and didn't DNS.
 */
export function calculateParticipationPoints(
  raceDistancePct: number,
  finishStatus: FinishStatus,
  participationPoints: number,
  participationMinDistancePct: number
): number {
  if (finishStatus === "DNS") return 0;
  if (raceDistancePct < participationMinDistancePct) return 0;
  return participationPoints;
}

/** The laps the leader covered in each race of a round, keyed by raceNumber.
 *  This is the same denominator the importer used for `raceDistancePct`
 *  (iRacing's `session.maxLaps`), reconstructed from the stored results so it
 *  also holds for CSV and iRLM imports, which never carry that number. */
export function leaderLapsByRace(
  results: { raceNumber: number; lapsCompleted: number }[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of results) {
    const cur = out.get(r.raceNumber) ?? 0;
    if (r.lapsCompleted > cur) out.set(r.raceNumber, r.lapsCompleted);
  }
  return out;
}

/**
 * Did this driver earn the round's participation points?
 *
 * The same threshold has two readings, chosen per scoring system:
 *
 *  - **per race** (default, and how every league scored until now): any single
 *    race of the round that reaches the threshold on its own distance earns
 *    the points.
 *  - **across the round** (`participationCombinedDistance`): the laps the
 *    driver completed in the WHOLE round are measured against the sum of the
 *    races' leader laps.
 *
 * The difference is not academic. The CAS Combined Cup runs two races per
 * round and its regulation asks for "75 % der Gesamt-Rundenzahl in der
 * kombinierten Wertung": a driver who wins race 1 and skips race 2 has 100 %
 * of one race but only half the round, and only the second reading refuses him
 * the points.
 */
export function participationEarned(
  results: {
    raceNumber: number;
    lapsCompleted: number;
    raceDistancePct: number;
    finishStatus: FinishStatus;
  }[],
  leaderLaps: Map<number, number>,
  minPct: number,
  combined: boolean
): boolean {
  const counted = results.filter((r) => r.finishStatus !== "DNS");
  if (!combined) {
    return counted.some((r) => r.raceDistancePct >= minPct);
  }
  let roundLaps = 0;
  for (const laps of leaderLaps.values()) roundLaps += laps;
  if (roundLaps <= 0) return false;
  const driven = counted.reduce((sum, r) => sum + r.lapsCompleted, 0);
  // Floored, exactly like the importer computes raceDistancePct — a driver on
  // 74.9 % is below 75, not rounded up into the points.
  return Math.floor((driven / roundLaps) * 100) >= minPct;
}

/**
 * Recompute the points for a single race result and persist the new values.
 * Picks the correct points table based on raceNumber (race 1 uses
 * pointsTable; race 2 uses pointsTableRace2 if set, falling back to pointsTable).
 *
 * Note: participationPointsAwarded is NOT set here — it's awarded once per
 * (round, registration) by recomputeRoundScoring to avoid double-counting
 * across multi-race rounds.
 */
export async function recomputeResultPoints(
  prisma: PrismaClient,
  resultId: string
): Promise<void> {
  const result = await prisma.raceResult.findUnique({
    where: { id: resultId },
    include: {
      round: {
        include: { season: { include: { scoringSystem: true } } },
      },
    },
  });
  if (!result) return;

  const scoring = result.round.season.scoringSystem;
  const pointsTable =
    result.raceNumber > 1 && scoring.pointsTableRace2
      ? (scoring.pointsTableRace2 as PointsTable)
      : (scoring.pointsTable as PointsTable);

  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    result.raceDistancePct,
    scoring.racePointsMinDistancePct,
    pointsTable
  );

  await prisma.raceResult.update({
    where: { id: resultId },
    data: {
      rawPointsAwarded: raw,
      // participationPointsAwarded is set by recomputeRoundScoring (per-round)
    },
  });
}

/**
 * Award participation per (round, registration) — once per round, not per race.
 * Sets participationPointsAwarded on the lowest-raceNumber result that earned
 * the participation; zeroes it on the others. This works correctly for both
 * single-race and multi-race rounds.
 */
async function recomputeParticipationForRound(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: true,
    },
  });
  if (!round) return;
  const scoring = round.season.scoringSystem;

  // Group results by registrationId
  const byReg = new Map<string, typeof round.raceResults>();
  for (const r of round.raceResults) {
    const list = byReg.get(r.registrationId) ?? [];
    list.push(r);
    byReg.set(r.registrationId, list);
  }

  const leaderLaps = leaderLapsByRace(round.raceResults);
  const combinedDistance = scoring.participationCombinedDistance === true;

  for (const list of byReg.values()) {
    const earned = participationEarned(
      list,
      leaderLaps,
      scoring.participationMinDistancePct,
      combinedDistance
    );
    const sorted = [...list].sort((a, b) => a.raceNumber - b.raceNumber);
    for (let i = 0; i < sorted.length; i++) {
      const target =
        earned && i === 0 ? scoring.participationPoints : 0;
      if (sorted[i].participationPointsAwarded !== target) {
        await prisma.raceResult.update({
          where: { id: sorted[i].id },
          data: { participationPointsAwarded: target },
        });
      }
    }
  }
}

/**
 * DSQ forfeit rule.
 *
 * Single-race rounds (racesPerRound === 1, e.g. GT3 WCT / IEC): a DSQ on the
 * round's only race forfeits that race — race + participation points zeroed.
 *
 * Multi-race rounds (racesPerRound > 1, e.g. SFL Cup's 2 sprints): each race is
 * scored independently, so a DSQ forfeits ONLY the DSQ'd race, leaving sibling
 * races (where the driver finished clean) untouched. A DSQ race already scores
 * 0 raw points via recomputeClassificationPointsForRound; here we additionally
 * zero its participation points. (Previously a DSQ in any race wiped the whole
 * round, wrongly zeroing clean races — fixed.)
 */
async function recomputeDsqForfeitForRound(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      season: { select: { scoringSystem: { select: { racesPerRound: true } } } },
      raceResults: {
        select: {
          id: true,
          registrationId: true,
          finishStatus: true,
          rawPointsAwarded: true,
          participationPointsAwarded: true,
        },
      },
    },
  });
  if (!round) return;
  const multiRace = (round.season.scoringSystem?.racesPerRound ?? 1) > 1;
  const results = round.raceResults;

  if (multiRace) {
    // Per-race forfeit: only the DSQ'd race loses its participation points
    // (raw is already 0 from classification scoring). Clean sibling races keep
    // their points.
    for (const r of results) {
      if (r.finishStatus !== "DSQ") continue;
      if (r.rawPointsAwarded !== 0 || r.participationPointsAwarded !== 0) {
        await prisma.raceResult.update({
          where: { id: r.id },
          data: { rawPointsAwarded: 0, participationPointsAwarded: 0 },
        });
      }
    }
    return;
  }

  // Single-race rounds: a DSQ on any of the driver's results forfeits the
  // whole round (in practice the round has one race per driver).
  const byReg = new Map<string, typeof results>();
  for (const r of results) {
    const list = byReg.get(r.registrationId) ?? [];
    list.push(r);
    byReg.set(r.registrationId, list);
  }
  for (const list of byReg.values()) {
    const dsq = list.some((r) => r.finishStatus === "DSQ");
    if (!dsq) continue;
    for (const r of list) {
      if (r.rawPointsAwarded !== 0 || r.participationPointsAwarded !== 0) {
        await prisma.raceResult.update({
          where: { id: r.id },
          data: { rawPointsAwarded: 0, participationPointsAwarded: 0 },
        });
      }
    }
  }
}

/**
 * Recompute Fair Play Rating awards for a round based on the scoring system.
 * Wipes existing awards and creates new ones.
 */
export async function recomputeRoundFPR(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: {
        include: {
          registration: {
            include: { team: true, carClass: true },
          },
        },
      },
    },
  });
  if (!round) return;

  await prisma.fPRAward.deleteMany({ where: { roundId } });

  const scoring = round.season.scoringSystem;
  if (!scoring.fprEnabled) return;

  const tiers = (scoring.fprTiers as FPRTier[] | null) ?? [];
  if (tiers.length === 0) return;
  const sortedTiers = [...tiers].sort((a, b) => a.max - b.max);

  type Bucket = { teamId: string; carClassId: string | null; incidents: number };
  const buckets = new Map<string, Bucket>();

  // Sum incidents by (team, class) — incidents accumulate across all races
  for (const r of round.raceResults) {
    const teamId = r.registration.teamId;
    if (!teamId) continue;
    const carClassId = round.season.isMulticlass
      ? r.registration.carClassId
      : null;
    const key = `${teamId}|${carClassId ?? ""}`;
    const cur = buckets.get(key);
    if (cur) cur.incidents += r.incidents;
    else buckets.set(key, { teamId, carClassId, incidents: r.incidents });
  }

  if (scoring.fprMode === "ALL_TEAMS_TIERED") {
    for (const b of buckets.values()) {
      const tier = sortedTiers.find((t) => b.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: b.teamId,
          carClassId: b.carClassId,
          teamIncidentTotal: b.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  } else if (scoring.fprMode === "LOWEST_TEAM_ONLY") {
    const byClass = new Map<string, Bucket[]>();
    for (const b of buckets.values()) {
      const k = b.carClassId ?? "";
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(b);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => a.incidents - b.incidents);
      const winner = list[0];
      const tier = sortedTiers.find((t) => winner.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: winner.teamId,
          carClassId: winner.carClassId,
          teamIncidentTotal: winner.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  }
}

/**
 * Recompute everything for a round: per-result raw points + per-round
 * participation + FPR.
 */
/**
 * Award overall race points by CLASSIFICATION rank, not raw iRacing finishing
 * position. Per race (raceNumber) within the round, the drivers who score
 * position points — i.e. NOT DSQ, NOT DNS, and at/above the race-points
 * minimum distance — are ranked 1..N by finishing position and given
 * pointsTable[rank]. Non-scoring drivers (DSQ / DNS / below min distance) are
 * excluded, so everyone behind them moves up and there are no gaps in the
 * points (e.g. a disqualified P4 promotes the old P5 into P4's points).
 *
 * This mirrors how class (Pro/Am) positions are already computed in
 * standings.ts, so overall and class scoring now use the same method.
 */
async function recomputeClassificationPointsForRound(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: true,
    },
  });
  if (!round) return;
  const scoring = round.season.scoringSystem;
  const minPct = scoring.racePointsMinDistancePct ?? 0;

  // Group by race (a round may have multiple races, each scored separately).
  const byRace = new Map<number, typeof round.raceResults>();
  for (const r of round.raceResults) {
    const list = byRace.get(r.raceNumber) ?? [];
    list.push(r);
    byRace.set(r.raceNumber, list);
  }

  for (const [raceNumber, list] of byRace) {
    const pointsTable = (raceNumber > 1 && scoring.pointsTableRace2
      ? scoring.pointsTableRace2
      : scoring.pointsTable) as PointsTable;

    // Drivers eligible for position points, ranked by finishing order.
    const ranked = new Map<string, number>();
    list
      .filter(
        (r) =>
          r.finishStatus !== "DSQ" &&
          r.finishStatus !== "DNS" &&
          r.raceDistancePct >= minPct
      )
      .sort((a, b) => a.finishPosition - b.finishPosition)
      .forEach((r, i) => ranked.set(r.id, i + 1));

    for (const r of list) {
      const rank = ranked.get(r.id);
      const raw = rank != null ? pointsTable[String(rank)] ?? 0 : 0;
      if (r.rawPointsAwarded !== raw) {
        await prisma.raceResult.update({
          where: { id: r.id },
          data: { rawPointsAwarded: raw },
        });
      }
    }
  }
}

export async function recomputeRoundScoring(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  await recomputeClassificationPointsForRound(prisma, roundId);
  await recomputeParticipationForRound(prisma, roundId);
  await recomputeDsqForfeitForRound(prisma, roundId);
  await recomputeRoundFPR(prisma, roundId);
}
