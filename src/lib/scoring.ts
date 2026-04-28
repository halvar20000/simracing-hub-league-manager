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
  pointsTable: PointsTable
): number {
  if (finishStatus !== "CLASSIFIED") return 0;
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

  for (const list of byReg.values()) {
    const earned = list.some(
      (r) =>
        r.finishStatus !== "DNS" &&
        r.raceDistancePct >= scoring.participationMinDistancePct
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
export async function recomputeRoundScoring(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const results = await prisma.raceResult.findMany({
    where: { roundId },
    select: { id: true },
  });
  for (const r of results) {
    await recomputeResultPoints(prisma, r.id);
  }
  await recomputeParticipationForRound(prisma, roundId);
  await recomputeRoundFPR(prisma, roundId);
}
