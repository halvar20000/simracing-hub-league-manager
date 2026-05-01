import type { PrismaClient } from "@prisma/client";

export interface RoundPoints {
  roundId: string;
  roundNumber: number;
  roundName: string;
  roundDate: Date;
  rawPoints: number;          // overall-position race points
  classRawPoints: number;     // class-position race points (within Pro or AM)
  participationPoints: number;
  penaltyPoints: number;
  correctionPoints: number;
  combinedPoints: number;     // = rawPoints + (participation if enabled) - penalty
  classPoints: number;        // = classRawPoints + participation - penalty
  hasResult: boolean;
  dropped: boolean;          // true when this round is one of the worst-N drop weeks
}

export interface DriverStanding {
  registrationId: string;
  startNumber: number | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  teamId: string | null;
  teamName: string | null;
  carClassId: string | null;
  carClassName: string | null;
  proAmClass: "PRO" | "AM" | null;
  rawPoints: number;
  classRawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  combinedTotal: number;
  classTotal: number;
  totalIncidents: number;
  iRating: number | null;
  excludedAt: Date | null;
  roundsCompleted: number;
  roundPoints: RoundPoints[];
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  totalPoints: number;
  scoringPoints: number;
  fprPoints: number;
  bestN: number;
  driversCount: number;
}

export async function computeDriverStandings(
  prisma: PrismaClient,
  seasonId: string,
  excludeRoundIds: string[] = []
): Promise<DriverStanding[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { scoringSystem: true },
  });
  const pointsTable = (season?.scoringSystem?.pointsTable ?? {}) as Record<
    string,
    number
  >;
  const proAmEnabled = !!season?.proAmEnabled;

  const [registrations, rounds] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId, status: "APPROVED" },
      include: {
        user: true,
        team: true,
        carClass: true,
        raceResults: {
          where:
            excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : undefined,
          include: { round: true },
        },
        penalties: {
          where: {
            type: "POINTS_DEDUCTION",
            ...(excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : {}),
          },
          select: {
            pointsValue: true,
            forgivenPoints: true,
            releasedAt: true,
            roundId: true,
          },
        },
      },
    }),
    prisma.round.findMany({
      where: { seasonId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, name: true, startsAt: true },
    }),
  ]);

  // Compute "class position" per result (rank within Pro or AM only)
  const classPositionByResult = new Map<string, number>();
  if (proAmEnabled) {
    const roundsWithResults = await prisma.round.findMany({
      where: {
        seasonId,
        ...(excludeRoundIds.length > 0
          ? { id: { notIn: excludeRoundIds } }
          : {}),
      },
      include: {
        raceResults: {
          include: {
            registration: { select: { proAmClass: true } },
          },
        },
      },
    });

    for (const round of roundsWithResults) {
      // Include any driver who'd earn position points (above the
      // racePointsMinDistancePct threshold and not DSQ/DNS).
      const minPct = season?.scoringSystem.racePointsMinDistancePct ?? 50;
      const classified = round.raceResults
        .filter(
          (r) =>
            r.finishStatus !== "DSQ" &&
            r.finishStatus !== "DNS" &&
            r.raceDistancePct >= minPct
        )
        .sort((a, b) => a.finishPosition - b.finishPosition);

      let proRank = 0;
      let amRank = 0;
      for (const r of classified) {
        const cls = r.registration.proAmClass;
        if (cls === "PRO") {
          proRank++;
          classPositionByResult.set(r.id, proRank);
        } else if (cls === "AM") {
          amRank++;
          classPositionByResult.set(r.id, amRank);
        }
      }
    }
  }

  const includeParticipationInCombined =
    season?.scoringSystem.participationInCombined ?? true;
  const defersPenalties = !!season?.scoringSystem?.deferPenaltyPoints;
  const standings: DriverStanding[] = registrations.map((reg) => {
    let raw = 0;
    let classRaw = 0;
    let participation = 0;
    let penalty = 0;
    let correction = 0;
    let totalIncidents = 0;

    for (const r of reg.raceResults) {
      raw += r.rawPointsAwarded;
      participation += r.participationPointsAwarded;
      penalty += r.manualPenaltyPoints;
      correction += r.correctionPoints;
      totalIncidents += r.incidents;

      if (proAmEnabled) {
        const classPos = classPositionByResult.get(r.id);
        if (classPos != null) {
          classRaw += pointsTable[String(classPos)] ?? 0;
        } else {
          classRaw += r.rawPointsAwarded;
        }
      } else {
        classRaw += r.rawPointsAwarded;
      }
    }

    for (const p of reg.penalties) {
      if (p.pointsValue == null) continue;
      // Deferred systems: only released penalties hit the standings.
      if (defersPenalties && p.releasedAt == null) continue;
      const effective = Math.max(0, p.pointsValue - (p.forgivenPoints ?? 0));
      penalty += effective;
    }

    const sortedNewestFirst = [...reg.raceResults].sort(
      (a, b) => b.round.roundNumber - a.round.roundNumber
    );
    let iRating: number | null = null;
    for (const r of sortedNewestFirst) {
      if (r.iRating != null) {
        iRating = r.iRating;
        break;
      }
    }

    const resultsByRoundId = new Map<string, typeof reg.raceResults>();
    for (const r of reg.raceResults) {
      const list = resultsByRoundId.get(r.roundId) ?? [];
      list.push(r);
      resultsByRoundId.set(r.roundId, list);
    }
    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const results = resultsByRoundId.get(round.id) ?? [];
      if (results.length === 0) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundName: round.name,
          roundDate: round.startsAt,
          rawPoints: 0,
          classRawPoints: 0,
          participationPoints: 0,
          penaltyPoints: 0,
          correctionPoints: 0,
          combinedPoints: 0,
          classPoints: 0,
          hasResult: false,
          dropped: false,
        };
      }
      const rRaw = results.reduce((sum, r) => sum + r.rawPointsAwarded, 0);
      const rPart = results.reduce(
        (sum, r) => sum + r.participationPointsAwarded,
        0
      );
      const rPen = results.reduce((sum, r) => sum + r.manualPenaltyPoints, 0);
      const rCorrection = results.reduce(
        (sum, r) => sum + r.correctionPoints,
        0
      );
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        rClassRaw = 0;
        for (const r of results) {
          const classPos = classPositionByResult.get(r.id);
          if (classPos != null) {
            rClassRaw += pointsTable[String(classPos)] ?? 0;
          } else {
            rClassRaw += r.rawPointsAwarded;
          }
        }
      }
      return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        roundName: round.name,
        roundDate: round.startsAt,
        rawPoints: rRaw,
        classRawPoints: rClassRaw,
        participationPoints: rPart,
        penaltyPoints: rPen,
        correctionPoints: rCorrection,
        combinedPoints: rRaw + (includeParticipationInCombined ? rPart : 0) - rPen + rCorrection,
        classPoints: rClassRaw + rPart - rPen + rCorrection,
        hasResult: true,
        dropped: false,
      };
    });

    // --- Drop worst N rounds (per ScoringSystem.dropWorstNRounds) ---
    // Priority: missed rounds (no result) first, then lowest combinedPoints.
    // Penalties are NEVER dropped — they always count.
    const dropN = season?.scoringSystem.dropWorstNRounds ?? 0;
    if (dropN > 0 && roundPoints.length > 0) {
      const sorted = [...roundPoints].sort((a, b) => {
        if (a.hasResult !== b.hasResult) {
          // false (no result) < true (has result), so missed rounds sort first
          return Number(a.hasResult) - Number(b.hasResult);
        }
        return a.combinedPoints - b.combinedPoints;
      });
      const droppedIds = new Set(
        sorted.slice(0, dropN).map((rp) => rp.roundId)
      );
      for (const rp of roundPoints) {
        if (droppedIds.has(rp.roundId)) {
          rp.dropped = true;
          if (rp.hasResult) {
            raw -= rp.rawPoints;
            classRaw -= rp.classRawPoints;
            participation -= rp.participationPoints;
            // penalty stays — penalties always count, even when the round is dropped
          }
          // Missed rounds contribute 0, so nothing to subtract.
        }
      }
    }

    return {
      registrationId: reg.id,
      startNumber: reg.startNumber,
      driverFirstName: reg.user.firstName,
      driverLastName: reg.user.lastName,
      countryCode: reg.user.countryCode,
      teamId: reg.teamId,
      teamName: reg.team?.name ?? null,
      carClassId: reg.carClassId,
      carClassName: reg.carClass?.name ?? null,
      proAmClass: reg.proAmClass as "PRO" | "AM" | null,
      rawPoints: raw,
      classRawPoints: classRaw,
      participationPoints: participation,
      manualPenalties: penalty,
      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction,
      classTotal: classRaw + participation - penalty + correction,
      totalIncidents,
      iRating,
      excludedAt: reg.excludedAt ?? null,
      roundsCompleted: reg.raceResults.length,
      roundPoints,
    };
  });

  standings.sort(
    (a, b) =>
      b.classTotal - a.classTotal ||
      b.classRawPoints - a.classRawPoints ||
      b.roundsCompleted - a.roundsCompleted ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
  );

  return standings;
}

export async function computeTeamStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<TeamStanding[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { teams: true, scoringSystem: true },
  });
  if (!season || season.teamScoringMode === "NONE") return [];

  const bestN =
    season.teamScoringMode === "SUM_BEST_N"
      ? season.teamScoringBestN ?? 2
      : Number.POSITIVE_INFINITY;

  const rounds = await prisma.round.findMany({
    where: { seasonId },
    include: {
      raceResults: {
        include: { registration: { select: { teamId: true } } },
      },
      fprAwards: true,
    },
  });

  const teamMap = new Map<
    string,
    {
      team: { id: string; name: string };
      scoringPoints: number;
      fprPoints: number;
      driverIds: Set<string>;
    }
  >();
  for (const t of season.teams) {
    teamMap.set(t.id, {
      team: { id: t.id, name: t.name },
      scoringPoints: 0,
      fprPoints: 0,
      driverIds: new Set(),
    });
  }

  for (const round of rounds) {
    const byTeam = new Map<string, number[]>();
    for (const r of round.raceResults) {
      const teamId = r.registration.teamId;
      if (!teamId) continue;
      const points =
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints;
      if (!byTeam.has(teamId)) byTeam.set(teamId, []);
      byTeam.get(teamId)!.push(points);
    }
    for (const [teamId, pointsList] of byTeam) {
      const sorted = [...pointsList].sort((a, b) => b - a);
      const taken = Number.isFinite(bestN)
        ? sorted.slice(0, bestN as number)
        : sorted;
      const sum = taken.reduce((s, p) => s + p, 0);
      const t = teamMap.get(teamId);
      if (t) t.scoringPoints += sum;
    }
    for (const award of round.fprAwards) {
      const t = teamMap.get(award.teamId);
      if (t) t.fprPoints += award.fprPointsAwarded;
    }
  }

  const regs = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED", teamId: { not: null } },
    select: { teamId: true, userId: true },
  });
  for (const r of regs) {
    if (!r.teamId) continue;
    const t = teamMap.get(r.teamId);
    if (t) t.driverIds.add(r.userId);
  }

  const standings: TeamStanding[] = Array.from(teamMap.values())
    .map((t) => ({
      teamId: t.team.id,
      teamName: t.team.name,
      scoringPoints: t.scoringPoints,
      fprPoints: t.fprPoints,
      totalPoints: t.scoringPoints + t.fprPoints,
      bestN: Number.isFinite(bestN) ? (bestN as number) : 0,
      driversCount: t.driverIds.size,
    }))
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.scoringPoints - a.scoringPoints ||
        a.teamName.localeCompare(b.teamName)
    );

  return standings;
}
