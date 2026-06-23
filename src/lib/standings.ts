import type { PrismaClient } from "@prisma/client";
import { readDriverFprTiers, fprPointsForIncidents } from "@/lib/driver-fpr";
import { isPerRacePenaltySeason } from "@/lib/penalty-application";

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
  gdcRawPoints: number;       // GDC-position race points (rank within the GDC cohort)
  hasResult: boolean;
  dropped: boolean;          // true when this round is one of the worst-N drop weeks
}

export interface DriverStanding {
  registrationId: string;
  startNumber: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  teamId: string | null;
  teamName: string | null;
  carClassId: string | null;
  carClassName: string | null;
  proAmClass: "PRO" | "AM" | null;
  inGdc: boolean;
  rawPoints: number;
  classRawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  /** Per-race penalty mode only: forgiveness (auto + manual) credited back to
   * the season total once the season is COMPLETED. 0 otherwise. */
  forgivenessCredit: number;
  /** Per-race penalty mode only: no-show points deducted from the season
   * total once the season is COMPLETED (already included in manualPenalties).
   * 0 otherwise. */
  noShowPenaltyPoints: number;
  combinedTotal: number;
  classTotal: number;
  gdcRawPoints: number;       // season GDC race points (0 for non-GDC drivers)
  gdcTotal: number;           // season GDC total — mirrors classTotal (0 for non-GDC)
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

/**
 * Options shared by every standings computation.
 *
 * Public consumers (standings page, season/league/home pages, the overlay
 * API, Discord posts) leave this at its default so results stay hidden until
 * a round is marked COMPLETED. Admin/steward preview views pass
 * `includeUnpublishedRounds: true` to see the round before it is published.
 */
export type StandingsOptions = {
  includeUnpublishedRounds?: boolean;
  /** Per-car standings only: when true, participation points are NOT added to
   *  the per-car total (race points − penalties + corrections). Participation
   *  is a Combined-championship-only bonus for the Combined Cup. */
  excludeParticipation?: boolean;
};

export async function computeDriverStandings(
  prisma: PrismaClient,
  seasonId: string,
  excludeRoundIds: string[] = [],
  opts: StandingsOptions = {}
): Promise<DriverStanding[]> {
  // Publish gate: by default only COMPLETED rounds contribute to standings.
  const onlyPublished = !opts.includeUnpublishedRounds;
  const completedRoundWhere = onlyPublished
    ? ({ status: "COMPLETED" } as const)
    : {};
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { scoringSystem: true, league: { select: { slug: true } } },
  });
  const pointsTable = (season?.scoringSystem?.pointsTable ?? {}) as Record<
    string,
    number
  >;
  // Per-race penalty mode (GT3 WCT 13th Season onward): incident penalties
  // hit the round they were incurred in; forgiveness + no-shows settle on the
  // season total when the season completes. See src/lib/penalty-application.ts.
  const perRacePenalties = season
    ? isPerRacePenaltySeason(season.league.slug, season.id)
    : false;
  const seasonCompleted = season?.status === "COMPLETED";
  const proAmEnabled = !!season?.proAmEnabled;
  const gdcEnabled = !!season?.gdcEnabled;
  const gdcPointsTable = (season?.scoringSystem?.gdcPointsTable ?? {}) as Record<
    string,
    number
  >;

  const [registrations, rounds] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId, status: "APPROVED" },
      include: {
        user: true,
        team: true,
        carClass: true,
        raceResults: {
          where: {
            ...(excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : {}),
            ...(onlyPublished ? { round: completedRoundWhere } : {}),
          },
          include: { round: true },
        },
        penalties: {
          where: {
            type: "POINTS_DEDUCTION",
            ...(excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : {}),
            ...(onlyPublished ? { round: completedRoundWhere } : {}),
          },
          select: {
            pointsValue: true,
            forgivenPoints: true,
            autoForgivenPoints: true,
            source: true,
            releasedAt: true,
            roundId: true,
          },
        },
      },
    }),
    prisma.round.findMany({
      where: { seasonId, ...completedRoundWhere },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, name: true, startsAt: true },
    }),
  ]);

  // Compute "class position" per result (rank within Pro or AM only) and
  // "GDC position" (rank within the opt-in Gentleman Driver Class cohort).
  // Both are class-relative rankings derived from the same finishing order.
  const classPositionByResult = new Map<string, number>();
  const gdcPositionByResult = new Map<string, number>();
  if (proAmEnabled || gdcEnabled) {
    const roundsWithResults = await prisma.round.findMany({
      where: {
        seasonId,
        ...completedRoundWhere,
        ...(excludeRoundIds.length > 0
          ? { id: { notIn: excludeRoundIds } }
          : {}),
      },
      include: {
        raceResults: {
          include: {
            registration: { select: { proAmClass: true, inGdc: true } },
          },
        },
      },
    });

    // Include any driver who'd earn position points (above the
    // racePointsMinDistancePct threshold and not DSQ/DNS).
    const minPct = season?.scoringSystem.racePointsMinDistancePct ?? 50;
    for (const round of roundsWithResults) {
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
      let gdcRank = 0;
      for (const r of classified) {
        if (proAmEnabled) {
          const cls = r.registration.proAmClass;
          if (cls === "PRO") {
            proRank++;
            classPositionByResult.set(r.id, proRank);
          } else if (cls === "AM") {
            amRank++;
            classPositionByResult.set(r.id, amRank);
          }
        }
        if (gdcEnabled && r.registration.inGdc) {
          gdcRank++;
          gdcPositionByResult.set(r.id, gdcRank);
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
    let gdcRaw = 0;
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

      // GDC race points: rank within the GDC cohort, scored off the
      // separate gdcPointsTable. A GDC driver with no GDC position for a
      // race (DSQ/DNS/below min distance) earns 0 GDC points there.
      if (gdcEnabled && reg.inGdc) {
        const gdcPos = gdcPositionByResult.get(r.id);
        if (gdcPos != null) {
          gdcRaw += gdcPointsTable[String(gdcPos)] ?? 0;
        }
      }
    }

    // Per-race penalty mode: incident penalties are deducted in full in the
    // round where they were incurred (releasedAt is ignored). Forgiveness
    // (auto + manual) and no-show points settle on the SEASON TOTAL only —
    // and only once the season is COMPLETED. Individual race results stay
    // untouched by forgiveness.
    const incidentPenaltyByRound = new Map<string, number>();
    let forgivenessCredit = 0;
    let noShowPenaltyPoints = 0;
    if (perRacePenalties) {
      for (const p of reg.penalties) {
        const pv = p.pointsValue ?? 0;
        if (pv <= 0) continue;
        if (p.source === "NO_RSVP_NO_SHOW") {
          // No-shows never touch individual races: deducted from the season
          // total at season end (manual forgiveness still respected).
          if (seasonCompleted) {
            noShowPenaltyPoints += Math.max(
              0,
              pv - (p.forgivenPoints ?? 0) - (p.autoForgivenPoints ?? 0)
            );
          }
          continue;
        }
        penalty += pv;
        incidentPenaltyByRound.set(
          p.roundId,
          (incidentPenaltyByRound.get(p.roundId) ?? 0) + pv
        );
        if (seasonCompleted) {
          forgivenessCredit += Math.min(
            pv,
            (p.forgivenPoints ?? 0) + (p.autoForgivenPoints ?? 0)
          );
        }
      }
      penalty += noShowPenaltyPoints;
    } else {
      for (const p of reg.penalties) {
        if (p.pointsValue == null) continue;
        // Deferred systems: only released penalties hit the standings.
        if (defersPenalties && p.releasedAt == null) continue;
        const effective = Math.max(0, p.pointsValue - (p.forgivenPoints ?? 0));
        penalty += effective;
      }
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
          gdcRawPoints: 0,
          hasResult: false,
          dropped: false,
        };
      }
      const rRaw = results.reduce((sum, r) => sum + r.rawPointsAwarded, 0);
      const rPart = results.reduce(
        (sum, r) => sum + r.participationPointsAwarded,
        0
      );
      // Per-race mode: incident penalties show up in the round they were
      // incurred, on top of any manual per-result penalty points.
      const rPen =
        results.reduce((sum, r) => sum + r.manualPenaltyPoints, 0) +
        (incidentPenaltyByRound.get(round.id) ?? 0);
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
      let rGdcRaw = 0;
      if (gdcEnabled && reg.inGdc) {
        for (const r of results) {
          const gdcPos = gdcPositionByResult.get(r.id);
          if (gdcPos != null) {
            rGdcRaw += gdcPointsTable[String(gdcPos)] ?? 0;
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
        gdcRawPoints: rGdcRaw,
        hasResult: true,
        dropped: false,
      };
    });

    // GDC ignores drop-weeks entirely — every race counts. Snapshot the
    // full-season participation here, BEFORE the drop block reduces it, so
    // gdcTotal is always built from undropped values. (raw race points stay
    // full for GDC because the drop block below no longer touches gdcRaw;
    // penalties/corrections/FPR are never dropped, so they need no snapshot.)
    const gdcParticipation = participation;

    // --- Drop worst N rounds (per ScoringSystem.dropWorstNRounds) ---
    // The COMBINED total drops the worst rounds ranked by combinedPoints; the
    // CLASS total drops the worst rounds ranked by classPoints. These two sets
    // DIFFER whenever a driver's overall finishing order differs from their
    // in-class order (Pro/Am) — so picking one set by combinedPoints and
    // applying it to the class total discards the wrong rounds and undercounts
    // class standings. Missed rounds (no result) are always dropped first.
    // Penalties / GDC are never dropped.
    let combRaw = raw;
    let combParticipation = participation;
    let classParticipation = participation;
    const dropN = season?.scoringSystem.dropWorstNRounds ?? 0;
    if (dropN > 0 && roundPoints.length > 0) {
      const pickDropped = (metric: (rp: RoundPoints) => number) => {
        const sorted = [...roundPoints].sort((a, b) => {
          if (a.hasResult !== b.hasResult) {
            // false (no result) < true (has result), so missed rounds sort first
            return Number(a.hasResult) - Number(b.hasResult);
          }
          return metric(a) - metric(b);
        });
        return new Set(sorted.slice(0, dropN).map((rp) => rp.roundId));
      };
      const droppedCombined = pickDropped((rp) => rp.combinedPoints);
      const droppedClass = pickDropped((rp) => rp.classPoints);
      for (const rp of roundPoints) {
        if (!rp.hasResult) continue; // missed rounds contribute 0
        if (droppedCombined.has(rp.roundId)) {
          combRaw -= rp.rawPoints;
          combParticipation -= rp.participationPoints;
        }
        if (droppedClass.has(rp.roundId)) {
          classRaw -= rp.classRawPoints;
          classParticipation -= rp.participationPoints;
        }
      }
      // Per-round `dropped` flag for the UI: reflect the audience the page
      // renders — class drops on Pro/Am seasons, combined drops otherwise.
      // (For single-class seasons classPoints === combinedPoints, so the two
      // sets coincide and behaviour is unchanged.)
      const flagSet = proAmEnabled ? droppedClass : droppedCombined;
      for (const rp of roundPoints) rp.dropped = flagSet.has(rp.roundId);
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
      inGdc: reg.inGdc,
      rawPoints: combRaw,
      classRawPoints: classRaw,
      participationPoints: proAmEnabled ? classParticipation : combParticipation,
      manualPenalties: penalty,
      forgivenessCredit,
      noShowPenaltyPoints,
      fprPoints: fprTotal,
      combinedTotal: combRaw + (includeParticipationInCombined ? combParticipation : 0) - penalty + correction + fprTotal + forgivenessCredit,
      classTotal: classRaw + classParticipation - penalty + correction + fprTotal + forgivenessCredit,
      gdcRawPoints: gdcEnabled && reg.inGdc ? gdcRaw : 0,
      gdcTotal:
        gdcEnabled && reg.inGdc
          ? gdcRaw + gdcParticipation - penalty + correction + fprTotal + forgivenessCredit
          : 0,
      totalIncidents,
      iRating,
      excludedAt: reg.excludedAt ?? null,
      roundsCompleted: reg.raceResults.length,
      roundPoints,
    };
  });

  standings.sort(
    (a, b) =>
      // Drivers who have raced at least one round always rank above drivers who
      // have not raced at all — non-participants sink to the bottom and are
      // never interleaved with drivers who drove (even on 0 points / 0 incidents
      // where the incident tiebreaker would otherwise float a non-racer up).
      Number(b.roundsCompleted > 0) - Number(a.roundsCompleted > 0) ||
      b.classTotal - a.classTotal ||
      // Tiebreaker: fewer total incidents ranks higher (applies to all leagues).
      a.totalIncidents - b.totalIncidents ||
      b.classRawPoints - a.classRawPoints ||
      b.roundsCompleted - a.roundsCompleted ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
  );

  return standings;
}

// ============================================================================
// GDC STANDINGS (Gentleman Driver Class)
// A parallel, opt-in class that runs alongside Pro/Am. Drivers flagged with
// Registration.inGdc earn class-relative points from ScoringSystem.gdcPointsTable
// and get their own ranking. GDC points never touch the combined / Pro / Am
// standings — this is purely a separate championship.
//
// Two GDC-specific rules: (1) drop-weeks never apply — every race a driver
// enters counts, even on seasons where Pro/Am drops its worst N rounds;
// (2) the whole season counts — flagging a driver mid-season retroactively
// includes their earlier rounds.
// ============================================================================
export async function computeGdcStandings(
  prisma: PrismaClient,
  seasonId: string,
  excludeRoundIds: string[] = []
): Promise<DriverStanding[]> {
  const all = await computeDriverStandings(prisma, seasonId, excludeRoundIds);
  return all
    .filter((s) => s.inGdc)
    .sort(
      (a, b) =>
        b.gdcTotal - a.gdcTotal ||
        a.totalIncidents - b.totalIncidents ||
        b.gdcRawPoints - a.gdcRawPoints ||
        b.roundsCompleted - a.roundsCompleted ||
        (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
    );
}

export async function computeTeamStandings(
  prisma: PrismaClient,
  seasonId: string,
  opts: StandingsOptions = {}
): Promise<TeamStanding[]> {
  const onlyPublished = !opts.includeUnpublishedRounds;
  const completedRoundWhere = onlyPublished
    ? ({ status: "COMPLETED" } as const)
    : {};
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { teams: true, scoringSystem: true, league: { select: { slug: true } } },
  });
  if (!season || season.teamScoringMode === "NONE") return [];

  // Per-race penalty mode: incident penalties reduce the driver's round
  // contribution BEFORE best-N selection, so a penalty can change which
  // drivers count for the team. No-show penalties never touch team scoring
  // (the driver has no result to contribute anyway).
  const perRacePenalties = isPerRacePenaltySeason(season.league.slug, season.id);
  const incidentPenaltyByRegRound = new Map<string, number>();
  if (perRacePenalties) {
    const pens = await prisma.penalty.findMany({
      where: {
        registration: { seasonId },
        type: "POINTS_DEDUCTION",
        pointsValue: { gt: 0 },
        source: { not: "NO_RSVP_NO_SHOW" },
        ...(onlyPublished ? { round: completedRoundWhere } : {}),
      },
      select: { registrationId: true, roundId: true, pointsValue: true },
    });
    for (const p of pens) {
      const key = `${p.registrationId}::${p.roundId}`;
      incidentPenaltyByRegRound.set(
        key,
        (incidentPenaltyByRegRound.get(key) ?? 0) + (p.pointsValue ?? 0)
      );
    }
  }

  const bestN =
    season.teamScoringMode === "SUM_BEST_N"
      ? season.teamScoringBestN ?? 2
      : Number.POSITIVE_INFINITY;

  // iRLM-style "Weeks counted: K" — keep only the team's best K round
  // contributions for the season total. Null = count all rounds.
  const weeksCounted = season.teamScoringWeeksCounted ?? null;

  // iRLM "Combined / Source: Raw Results / Bonus: None" — when true, the
  // per-driver round contribution is rawPointsAwarded only (no
  // participation, no manual penalty deduction).
  const rawOnly = !!season.teamScoringRawOnly;

  // Combined Cup (latest rulebook §5.2): the team championship takes the two
  // best team results "aus der kombinierten Wertung" — i.e. the best N drivers
  // per team per ROUND, ranked by their COMBINED (Race1+Race2) result, scored
  // on RACE POINTS ONLY (penalties apply; participation/FPR are driver-only
  // bonuses and never count for teams). This differs from the default
  // best-N-per-race path used by e.g. SFL.
  const perRoundCombined = season.league.slug === "cas-combined-cup";

  const rounds = await prisma.round.findMany({
    where: { seasonId, ...completedRoundWhere },
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
      // Per-round contributions for this team (before "weeks counted" cap).
      roundContributions: number[];
      scoringPoints: number;
      fprPoints: number;
      driverIds: Set<string>;
    }
  >();
  for (const t of season.teams) {
    teamMap.set(t.id, {
      team: { id: t.id, name: t.name },
      roundContributions: [],
      scoringPoints: 0,
      fprPoints: 0,
      driverIds: new Set(),
    });
  }

  for (const round of rounds) {
    if (perRoundCombined) {
      // Combined Cup: aggregate each driver's RACE points across the round's
      // races (Race1 + Race2), subtract penalties (no participation/bonus),
      // then take the best N driver contributions per team for the round.
      const byDriver = new Map<string, { teamId: string; points: number }>();
      for (const r of round.raceResults) {
        const teamId = r.registration.teamId;
        if (!teamId) continue;
        const cur = byDriver.get(r.registrationId) ?? { teamId, points: 0 };
        cur.points += r.rawPointsAwarded - r.manualPenaltyPoints;
        byDriver.set(r.registrationId, cur);
      }
      // Per-race penalty mode (not used by CC today, but kept correct): the
      // round's incident penalty is already summed per driver above only if it
      // lives on RaceResult; the separate per-round pool is subtracted here.
      if (perRacePenalties) {
        for (const [regId, cur] of byDriver) {
          cur.points -= incidentPenaltyByRegRound.get(`${regId}::${round.id}`) ?? 0;
        }
      }
      const byTeam = new Map<string, number[]>();
      for (const { teamId, points } of byDriver.values()) {
        if (!byTeam.has(teamId)) byTeam.set(teamId, []);
        byTeam.get(teamId)!.push(points);
      }
      for (const [teamId, list] of byTeam) {
        const sorted = [...list].sort((a, b) => b - a);
        const taken = Number.isFinite(bestN) ? sorted.slice(0, bestN as number) : sorted;
        const sum = taken.reduce((s, p) => s + p, 0);
        const t = teamMap.get(teamId);
        if (t) t.roundContributions.push(sum);
      }
    } else {
      // Default (e.g. SFL): best N driver results per team within EACH race,
      // summed across the round's races. Mirrors iRLM's team scoring (Race 1 +
      // Race 2 sessions scored independently, then combined). Single-race
      // rounds behave exactly the same.
      type Entry = {
        teamId: string;
        registrationId: string;
        raceNumber: number;
        points: number;
      };
      const entries: Entry[] = [];
      for (const r of round.raceResults) {
        const teamId = r.registration.teamId;
        if (!teamId) continue;
        const points = rawOnly
          ? r.rawPointsAwarded
          : r.rawPointsAwarded +
            r.participationPointsAwarded -
            r.manualPenaltyPoints;
        entries.push({
          teamId,
          registrationId: r.registrationId,
          raceNumber: r.raceNumber,
          points,
        });
      }
      // Per-race penalty mode: subtract the driver's incident penalties for
      // this round from their contribution (once, from their highest-scoring
      // race of the round) BEFORE the best-N pick below.
      if (perRacePenalties) {
        const byReg = new Map<string, Entry[]>();
        for (const e of entries) {
          const list = byReg.get(e.registrationId) ?? [];
          list.push(e);
          byReg.set(e.registrationId, list);
        }
        for (const [regId, list] of byReg) {
          const pen =
            incidentPenaltyByRegRound.get(`${regId}::${round.id}`) ?? 0;
          if (pen <= 0) continue;
          const target = list.reduce((a, b) => (b.points > a.points ? b : a));
          target.points -= pen;
        }
      }
      const byTeamRace = new Map<string, Map<number, number[]>>();
      for (const e of entries) {
        if (!byTeamRace.has(e.teamId)) byTeamRace.set(e.teamId, new Map());
        const races = byTeamRace.get(e.teamId)!;
        if (!races.has(e.raceNumber)) races.set(e.raceNumber, []);
        races.get(e.raceNumber)!.push(e.points);
      }
      for (const [teamId, races] of byTeamRace) {
        let sum = 0;
        for (const pointsList of races.values()) {
          const sorted = [...pointsList].sort((a, b) => b - a);
          const taken = Number.isFinite(bestN)
            ? sorted.slice(0, bestN as number)
            : sorted;
          sum += taken.reduce((s, p) => s + p, 0);
        }
        const t = teamMap.get(teamId);
        if (t) t.roundContributions.push(sum);
      }
    }
    for (const award of round.fprAwards) {
      const t = teamMap.get(award.teamId);
      if (t) t.fprPoints += award.fprPointsAwarded;
    }
  }

  // Apply weeks-counted cap per team.
  for (const t of teamMap.values()) {
    const sorted = [...t.roundContributions].sort((a, b) => b - a);
    const kept =
      weeksCounted != null && weeksCounted > 0
        ? sorted.slice(0, weeksCounted)
        : sorted;
    t.scoringPoints = kept.reduce((s, v) => s + v, 0);
  }

  const regs = await prisma.registration.findMany({
    where: {
      seasonId,
      status: "APPROVED",
      teamId: { not: null },
      // Non-driving team managers don't count as drivers.
      isTeamManager: false,
    },
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
  startNumber: string | null;
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
  seasonId: string,
  opts: StandingsOptions = {}
): Promise<CarStanding[]> {
  const onlyPublished = !opts.includeUnpublishedRounds;
  const results = await prisma.raceResult.findMany({
    where: {
      round: { seasonId, ...(onlyPublished ? { status: "COMPLETED" } : {}) },
      carId: { not: null },
    },
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
    countryCode: string | null; startNumber: string | null;
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
      // Combined Cup excludes participation from the per-car championship
      // (participation only counts toward the Combined standing).
      const participationForTotal = opts.excludeParticipation ? 0 : b.participation;
      const total = b.raw + participationForTotal - b.manual + b.correction;
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
  seasonId: string,
  opts: StandingsOptions = {}
): Promise<TeamClassGroup[]> {
  const onlyPublished = !opts.includeUnpublishedRounds;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { scoringSystem: true },
  });
  if (!season) return [];
  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;
  const participationPointsAward = season.scoringSystem.participationPoints ?? 0;
  const participationMinPct = season.scoringSystem.participationMinDistancePct ?? 75;
  const racePointsMinPct = season.scoringSystem.racePointsMinDistancePct ?? 50;
  const teamFprEnabled = !!season.scoringSystem.driverFprEnabled;
  const teamFprTiers = teamFprEnabled
    ? readDriverFprTiers(season.scoringSystem.driverFprTiers)
    : [];
  const teamFprMinDistance = season.scoringSystem.driverFprMinDistancePct ?? 90;

  const results = await prisma.teamResult.findMany({
    where: { round: { seasonId, ...(onlyPublished ? { status: "COMPLETED" } : {}) } },
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
  // First pass: per-(roundId, carClassId) max laps. In multi-class IEC the
  // GT4 leader runs far fewer overall laps than the LMP2 leader, so the
  // stored TeamResult.raceDistancePct (which is computed against the
  // session-wide max) under-counts slower classes. Gates need to be
  // CLASS-relative: GT4 is at 100% when it ran 100% of GT4's leader.
  const maxLapsByRoundAndClass = new Map<string, number>();
  for (const r of results) {
    if (!r.carClass) continue;
    const key = `${r.round.id}::${r.carClass.id}`;
    const cur = maxLapsByRoundAndClass.get(key) ?? 0;
    if (r.lapsCompleted > cur) maxLapsByRoundAndClass.set(key, r.lapsCompleted);
  }
  const classDistancePctFor = (r: (typeof results)[number]): number => {
    if (!r.carClass) return r.raceDistancePct ?? 0;
    const max = maxLapsByRoundAndClass.get(`${r.round.id}::${r.carClass.id}`);
    if (!max || max <= 0) return r.raceDistancePct ?? 0;
    return Math.min(100, Math.floor((r.lapsCompleted / max) * 100));
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
    // A team that didn't reach the configured min race distance gets 0 race
    // points (raceDistancePct defaults to 50; IEC sets this to 90). The
    // distance check is CLASS-relative so multi-class slower classes aren't
    // disadvantaged. A team that was disqualified (DSQ) forfeits all
    // scoring for the round — race, participation, and FPR — mirroring the
    // driver-DSQ forfeit rule.
    const isDsq = r.finishStatus === "DSQ";
    const classDistance = classDistancePctFor(r);
    const meetsRaceDistance = !isDsq && classDistance >= racePointsMinPct;
    const basePts =
      meetsRaceDistance && r.classPosition != null
        ? pointsTable[String(r.classPosition)] ?? 0
        : 0;
    const stored = r.rawPointsAwarded ?? 0;
    const racePts = meetsRaceDistance
      ? stored > 0
        ? stored
        : basePts
      : 0;

    // --- team participation + fpr (computed) ---
    // DSQ teams forfeit participation and FPR alongside race points.
    const participationStored = r.participationPointsAwarded ?? 0;
    let participation = participationStored;
    if (
      !isDsq &&
      participation === 0 &&
      classDistance >= participationMinPct
    ) {
      participation = participationPointsAward;
    }
    if (isDsq) participation = 0;

    let fprPoints = 0;
    if (
      !isDsq &&
      teamFprEnabled &&
      classDistance >= teamFprMinDistance
    ) {
      fprPoints = fprPointsForIncidents(r.totalIncidents ?? 0, teamFprTiers);
    }

    const correction = r.correctionPoints ?? 0;
    const penalty = r.manualPenaltyPoints ?? 0;
    const pts = racePts + participation + correction - penalty + fprPoints;
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
