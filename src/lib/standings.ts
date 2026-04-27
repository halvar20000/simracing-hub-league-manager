import type { PrismaClient } from "@prisma/client";

export interface RoundPoints {
  roundId: string;
  roundNumber: number;
  roundName: string;
  combinedPoints: number;
  classPoints: number;
  hasResult: boolean;
}

export interface DriverStanding {
  registrationId: string;
  startNumber: number | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  teamId: string | null;
  teamName: string | null;
  carClassId: string | null;
  carClassName: string | null;
  proAmClass: "PRO" | "AM" | null;
  rawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  combinedTotal: number;
  classTotal: number;
  totalIncidents: number;
  iRating: number | null;
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
  const excludeFilter = excludeRoundIds.length > 0
    ? { roundId: { notIn: excludeRoundIds } }
    : {};
  const [registrations, rounds] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId, status: "APPROVED" },
      include: {
        user: true,
        team: true,
        carClass: true,
        raceResults: {
          where: excludeRoundIds.length > 0 ? { roundId: { notIn: excludeRoundIds } } : undefined,
          include: { round: true },
        },
        penalties: {
          where: {
            type: "POINTS_DEDUCTION",
            ...(excludeRoundIds.length > 0 ? { roundId: { notIn: excludeRoundIds } } : {}),
          },
        },
      },
    }),
    prisma.round.findMany({
      where: { seasonId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, name: true },
    }),
  ]);
  void excludeFilter;

  const standings: DriverStanding[] = registrations.map((reg) => {
    let raw = 0;
    let participation = 0;
    let penalty = 0;
    let totalIncidents = 0;
    for (const r of reg.raceResults) {
      raw += r.rawPointsAwarded;
      participation += r.participationPointsAwarded;
      penalty += r.manualPenaltyPoints;
      totalIncidents += r.incidents;
    }
    // Add decision-driven point penalties on top of admin-entered ones
    for (const p of reg.penalties) {
      if (p.pointsValue != null) penalty += p.pointsValue;
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

    const resultsByRoundId = new Map(
      reg.raceResults.map((r) => [r.roundId, r])
    );

    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const result = resultsByRoundId.get(round.id);
      if (!result) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundName: round.name,
          combinedPoints: 0,
          classPoints: 0,
          hasResult: false,
        };
      }
      const combined =
        result.rawPointsAwarded - result.manualPenaltyPoints;
      const cls =
        result.rawPointsAwarded +
        result.participationPointsAwarded -
        result.manualPenaltyPoints;
      return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        roundName: round.name,
        combinedPoints: combined,
        classPoints: cls,
        hasResult: true,
      };
    });

    return {
      registrationId: reg.id,
      startNumber: reg.startNumber,
      driverFirstName: reg.user.firstName,
      driverLastName: reg.user.lastName,
      teamId: reg.teamId,
      teamName: reg.team?.name ?? null,
      carClassId: reg.carClassId,
      carClassName: reg.carClass?.name ?? null,
      proAmClass: reg.proAmClass as "PRO" | "AM" | null,
      rawPoints: raw,
      participationPoints: participation,
      manualPenalties: penalty,
      combinedTotal: raw - penalty,
      classTotal: raw + participation - penalty,
      totalIncidents,
      iRating,
      roundsCompleted: reg.raceResults.length,
      roundPoints,
    };
  });

  standings.sort(
    (a, b) =>
      b.classTotal - a.classTotal ||
      b.rawPoints - a.rawPoints ||
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
