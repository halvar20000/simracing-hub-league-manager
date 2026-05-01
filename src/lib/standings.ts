import type { PrismaClient } from "@prisma/client";
import { readDriverFprTiers, fprPointsForIncidents } from "@/lib/driver-fpr";

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
  const driverFprEnabled = !!season?.scoringSystem?.driverFprEnabled;
  const driverFprTiers = driverFprEnabled
    ? readDriverFprTiers(season?.scoringSystem?.driverFprTiers)
    : [];
  const driverFprMinDistance = season?.scoringSystem?.driverFprMinDistancePct ?? 90;
  const standings: DriverStanding[] = registrations.map((reg) => {
    let raw = 0;
    let classRaw = 0;
    let participation = 0;
    let penalty = 0;
    let correction = 0;
    let totalIncidents = 0;
    let fprTotal = 0;

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
      const roundIncidents = results.reduce((sum, r) => sum + (r.incidents ?? 0), 0);
      // Per-round driver FPR — based on TOTAL incidents in the round.
      // Eligibility: every race in the round must hit the min-distance threshold.
      const fprEligible = results.length > 0 && results.every(
        (r) => (r.raceDistancePct ?? 0) >= driverFprMinDistance
      );
      const roundFpr = driverFprEnabled && fprEligible
        ? fprPointsForIncidents(roundIncidents, driverFprTiers)
        : 0;
      if (results.length > 0) fprTotal += roundFpr;

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
        fprPoints: roundFpr,
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
      fprPoints: fprTotal,
      combinedTotal: raw + (includeParticipationInCombined ? participation : 0) - penalty + correction + fprTotal,
      classTotal: classRaw + participation - penalty + correction + fprTotal,
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


// ============================================================================
// CAR STANDINGS
// Drivers grouped by the car they drove. Drivers who switched cars during the
// season appear under each car they used, with the points they actually
// scored while in that car.
// ============================================================================

export interface CarStandingDriver {
  registrationId: string;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  startNumber: number | null;
  teamName: string | null;
  rawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  correctionPoints: number;
  combinedTotal: number;
  roundsCompleted: number;
}

export interface CarStanding {
  carId: string;
  carName: string;
  carClassShortCode: string | null;
  drivers: CarStandingDriver[];
  totalPoints: number;
}

export async function computeCarStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<CarStanding[]> {
  const results = await prisma.raceResult.findMany({
    where: { round: { seasonId }, carId: { not: null } },
    include: {
      car: { include: { carClass: { select: { shortCode: true } } } },
      registration: {
        include: {
          user: { select: { firstName: true, lastName: true, countryCode: true } },
          team: { select: { name: true } },
        },
      },
    },
  });

  type Bucket = {
    raw: number; participation: number; manual: number; correction: number;
    rounds: Set<string>;
    firstName: string | null; lastName: string | null;
    countryCode: string | null; startNumber: number | null;
    teamName: string | null;
  };

  // Map<carId, { name, classShort, drivers: Map<regId, Bucket> }>
  const byCar = new Map<string, {
    name: string;
    classShort: string | null;
    drivers: Map<string, Bucket>;
  }>();

  for (const r of results) {
    if (!r.carId || !r.car) continue;
    let car = byCar.get(r.carId);
    if (!car) {
      byCar.set(r.carId, car = {
        name: r.car.name,
        classShort: r.car.carClass?.shortCode ?? null,
        drivers: new Map(),
      });
    }
    let b = car.drivers.get(r.registrationId);
    if (!b) {
      b = {
        raw: 0, participation: 0, manual: 0, correction: 0,
        rounds: new Set(),
        firstName: r.registration.user.firstName,
        lastName: r.registration.user.lastName,
        countryCode: r.registration.user.countryCode,
        startNumber: r.registration.startNumber,
        teamName: r.registration.team?.name ?? null,
      };
      car.drivers.set(r.registrationId, b);
    }
    b.raw += r.rawPointsAwarded;
    b.participation += r.participationPointsAwarded;
    b.manual += r.manualPenaltyPoints;
    b.correction += r.correctionPoints;
    b.rounds.add(r.roundId);
  }

  const out: CarStanding[] = [];
  for (const [carId, car] of byCar.entries()) {
    const drivers: CarStandingDriver[] = [];
    let totalPoints = 0;
    for (const [regId, b] of car.drivers.entries()) {
      const total = b.raw + b.participation - b.manual + b.correction;
      totalPoints += total;
      drivers.push({
        registrationId: regId,
        driverFirstName: b.firstName,
        driverLastName: b.lastName,
        countryCode: b.countryCode,
        startNumber: b.startNumber,
        teamName: b.teamName,
        rawPoints: b.raw,
        participationPoints: b.participation,
        manualPenalties: b.manual,
        correctionPoints: b.correction,
        combinedTotal: total,
        roundsCompleted: b.rounds.size,
      });
    }
    drivers.sort((a, b) => b.combinedTotal - a.combinedTotal);
    out.push({
      carId,
      carName: car.name,
      carClassShortCode: car.classShort,
      drivers,
      totalPoints,
    });
  }
  out.sort((a, b) => b.totalPoints - a.totalPoints);
  return out;
}


// ============================================================================
// TEAM CLASS STANDINGS (endurance / IEC)
// Reads TeamResult rows directly. Each carClass is its own championship.
// Points come from scoringSystem.pointsTable[classPosition].
// ============================================================================

export interface TeamClassRoundResult {
  roundId: string;
  roundNumber: number;
  roundName: string;
  finishPosition: number;
  classPosition: number | null;
  points: number;
  totalIncidents: number;
  finishStatus: string;
}

export interface TeamClassStanding {
  teamId: string;
  teamName: string;
  totalPoints: number;
  totalIncidents: number;
  roundsCompleted: number;
  bestClassFinish: number | null;
  rounds: TeamClassRoundResult[];
}

export interface TeamClassGroup {
  carClassId: string;
  carClassName: string;
  carClassShortCode: string;
  teams: TeamClassStanding[];
}

export async function computeTeamClassStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<TeamClassGroup[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { scoringSystem: true },
  });
  if (!season) return [];
  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;

  const results = await prisma.teamResult.findMany({
    where: { round: { seasonId } },
    include: {
      team: { select: { id: true, name: true } },
      carClass: { select: { id: true, name: true, shortCode: true, displayOrder: true } },
      round: { select: { id: true, roundNumber: true, name: true } },
    },
  });

  // Group by carClassId → teamId → rounds
  type Bucket = {
    classId: string;
    className: string;
    classShort: string;
    classOrder: number;
    teams: Map<string, {
      teamName: string;
      total: number;
      incidents: number;
      rounds: TeamClassRoundResult[];
    }>;
  };
  const byClass = new Map<string, Bucket>();
  for (const r of results) {
    if (!r.carClass) continue;
    const cid = r.carClass.id;
    let b = byClass.get(cid);
    if (!b) {
      b = {
        classId: cid,
        className: r.carClass.name,
        classShort: r.carClass.shortCode,
        classOrder: r.carClass.displayOrder ?? 0,
        teams: new Map(),
      };
      byClass.set(cid, b);
    }
    let t = b.teams.get(r.team.id);
    if (!t) {
      t = { teamName: r.team.name, total: 0, incidents: 0, rounds: [] };
      b.teams.set(r.team.id, t);
    }
    const pts = r.classPosition != null ? (pointsTable[String(r.classPosition)] ?? 0) : 0;
    t.total += pts;
    t.incidents += r.totalIncidents;
    t.rounds.push({
      roundId: r.round.id,
      roundNumber: r.round.roundNumber,
      roundName: r.round.name,
      finishPosition: r.finishPosition,
      classPosition: r.classPosition,
      points: pts,
      totalIncidents: r.totalIncidents,
      finishStatus: r.finishStatus,
    });
  }

  const out: TeamClassGroup[] = [];
  for (const b of byClass.values()) {
    const teams: TeamClassStanding[] = [];
    for (const [teamId, t] of b.teams.entries()) {
      const sorted = [...t.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
      const bestClassFinish = sorted
        .map((r) => r.classPosition)
        .filter((x): x is number => x != null)
        .reduce<number | null>((m, x) => (m == null ? x : Math.min(m, x)), null);
      teams.push({
        teamId,
        teamName: t.teamName,
        totalPoints: t.total,
        totalIncidents: t.incidents,
        roundsCompleted: t.rounds.length,
        bestClassFinish,
        rounds: sorted,
      });
    }
    teams.sort((a, b) => b.totalPoints - a.totalPoints || (a.bestClassFinish ?? 999) - (b.bestClassFinish ?? 999));
    out.push({
      carClassId: b.classId,
      carClassName: b.className,
      carClassShortCode: b.classShort,
      teams,
    });
  }
  out.sort((a, b) => {
    // Order classes by their displayOrder via the original Bucket.
    const aOrder = byClass.get(a.carClassId)?.classOrder ?? 0;
    const bOrder = byClass.get(b.carClassId)?.classOrder ?? 0;
    return aOrder - bOrder || a.carClassName.localeCompare(b.carClassName);
  });
  return out;
}
