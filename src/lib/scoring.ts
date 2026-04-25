import type {
  PrismaClient,
  FinishStatus,
  ScoringSystem,
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
  const pointsTable = scoring.pointsTable as PointsTable;

  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    pointsTable
  );
  const participation = calculateParticipationPoints(
    result.raceDistancePct,
    result.finishStatus,
    scoring.participationPoints,
    scoring.participationMinDistancePct
  );

  await prisma.raceResult.update({
    where: { id: resultId },
    data: {
      rawPointsAwarded: raw,
      participationPointsAwarded: participation,
    },
  });
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

  // Wipe existing FPR awards for this round
  await prisma.fPRAward.deleteMany({ where: { roundId } });

  const scoring = round.season.scoringSystem;
  if (!scoring.fprEnabled) return;

  const tiers = (scoring.fprTiers as FPRTier[] | null) ?? [];
  if (tiers.length === 0) return;
  const sortedTiers = [...tiers].sort((a, b) => a.max - b.max);

  // Sum incidents per (team, class)
  type Bucket = {
    teamId: string;
    carClassId: string | null;
    incidents: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const r of round.raceResults) {
    const teamId = r.registration.teamId;
    if (!teamId) continue; // Independent drivers don't contribute
    const carClassId = round.season.isMulticlass
      ? r.registration.carClassId
      : null;
    const key = `${teamId}|${carClassId ?? ""}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.incidents += r.incidents;
    } else {
      buckets.set(key, { teamId, carClassId, incidents: r.incidents });
    }
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
    // Group by class, pick lowest-incident team per class
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
 * Recompute everything for a round: per-result points + FPR awards.
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
  await recomputeRoundFPR(prisma, roundId);
}
