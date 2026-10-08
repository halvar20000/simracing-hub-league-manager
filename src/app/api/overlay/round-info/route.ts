/**
 * Public read-only "pre-race" endpoint for the iRacing OBS overlays.
 *
 * Feeds the overlays a broadcaster shows before a round starts:
 *   - lastRound      — full results of the most recent COMPLETED round,
 *                      per race (race 1 / race 2 of a multi-race round),
 *                      plus `combined`: the round's combined classification
 *                      computed exactly like the round page's Combined tab
 *                      (race pts + participation + driver FPR − penalties,
 *                      same tie-breaks), and `driverOfTheDay` (the round's
 *                      DotD as shown publicly on the round page; null when
 *                      none was computed)
 *   - nextRound      — the next round that is not completed yet, with its
 *                      RSVP status as COUNTS ONLY (no driver names: the
 *                      RSVP list is not public on the site)
 *   - participation  — entries / finishers per completed round plus season
 *                      totals (same numbers as the season stats page)
 *
 * Like /api/overlay/standings it only ever exposes COMPLETED rounds' results,
 * is unauthenticated and CORS-open, and is cached briefly at the edge.
 *
 * Query params:
 *   - league   (required) — League.slug, e.g. "cas-pccd"
 *   - season   (optional) — Season.id; if omitted, picks the league's current
 *                           season the same way /api/overlay/standings does
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readDriverFprTiers, fprPointsForIncidents } from "@/lib/driver-fpr";
import { isPerRacePenaltySeason } from "@/lib/penalty-application";
import { penaltiesScoreToTeam } from "@/lib/team-penalty-attribution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function displayName(u: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
} | null): string {
  if (!u) return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "—";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueSlug = searchParams.get("league");
  const seasonIdParam = searchParams.get("season");

  if (!leagueSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing required query param 'league'" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!league) {
    return NextResponse.json(
      { ok: false, error: `Unknown league slug: ${leagueSlug}` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Same season resolution as /api/overlay/standings.
  const season = seasonIdParam
    ? await prisma.season.findFirst({
        where: { id: seasonIdParam, leagueId: league.id },
        include: { scoringSystem: true },
      })
    : await prisma.season.findFirst({
        where: {
          leagueId: league.id,
          isArchived: false,
          status: { in: ["ACTIVE", "OPEN_REGISTRATION"] },
        },
        orderBy: { startsOn: "desc" },
        include: { scoringSystem: true },
      });
  if (!season) {
    return NextResponse.json(
      { ok: false, error: `No active season found for league ${leagueSlug}` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id },
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      name: true,
      track: true,
      trackConfig: true,
      startsAt: true,
      status: true,
      countsForChampionship: true,
      rsvpClosedAt: true,
    },
  });
  const completed = rounds.filter((r) => r.status === "COMPLETED");

  // ---------- last completed round: full results per race ----------
  const lastMeta = completed[completed.length - 1] ?? null;
  let lastRound = null;
  if (lastMeta) {
    const results = await prisma.raceResult.findMany({
      where: { roundId: lastMeta.id },
      orderBy: [{ raceNumber: "asc" }, { finishPosition: "asc" }],
      select: {
        id: true,
        registrationId: true,
        raceDistancePct: true,
        raceNumber: true,
        finishPosition: true,
        classPosition: true,
        startPosition: true,
        lapsCompleted: true,
        totalTimeMs: true,
        bestLapTimeMs: true,
        incidents: true,
        finishStatus: true,
        rawPointsAwarded: true,
        participationPointsAwarded: true,
        manualPenaltyPoints: true,
        car: { select: { name: true, shortName: true } },
        registration: {
          select: {
            startNumber: true,
            proAmClass: true,
            team: { select: { name: true } },
            car: { select: { name: true, shortName: true } },
            user: {
              select: {
                firstName: true,
                lastName: true,
                name: true,
                countryCode: true,
                iracingMemberId: true,
              },
            },
          },
        },
      },
    });

    const byRace = new Map<number, typeof results>();
    for (const r of results) {
      if (!byRace.has(r.raceNumber)) byRace.set(r.raceNumber, []);
      byRace.get(r.raceNumber)!.push(r);
    }
    // ---- combined classification (mirrors the round page's Combined tab) ----
    const sc = season.scoringSystem;
    const pointsTable = (sc.pointsTable ?? {}) as Record<string, number>;
    const minPct = sc.racePointsMinDistancePct ?? 50;
    // Pro/Am seasons: class-relative race points, ranked per class over the
    // eligible results in overall finishing order (same as the page).
    const classPts = new Map<string, number>();
    if (season.proAmEnabled) {
      let pro = 0;
      let am = 0;
      for (const r of [...results]
        .filter((x) => x.finishStatus !== "DSQ" && x.finishStatus !== "DNS" && x.raceDistancePct >= minPct)
        .sort((a, b) => a.finishPosition - b.finishPosition)) {
        const cls = r.registration.proAmClass;
        const rank = cls === "PRO" ? ++pro : cls === "AM" ? ++am : null;
        if (rank != null) classPts.set(r.id, pointsTable[String(rank)] ?? 0);
      }
    }
    const racePointsOf = (r: (typeof results)[number]) =>
      season.proAmEnabled ? classPts.get(r.id) ?? r.rawPointsAwarded : r.rawPointsAwarded;
    const includeParticipation = sc.participationInCombined ?? true;
    const fprEnabled = !!sc.driverFprEnabled;
    const fprTiers = fprEnabled ? readDriverFprTiers(sc.driverFprTiers) : [];
    const fprMinPct = sc.driverFprMinDistancePct ?? 90;

    type Agg = {
      rows: typeof results;
      racePoints: number;
      participation: number;
      penalty: number;
      incidents: number;
      fpr: number;
      total: number;
    };
    const agg = new Map<string, Agg>();
    for (const r of results) {
      const a = agg.get(r.registrationId) ?? {
        rows: [], racePoints: 0, participation: 0, penalty: 0, incidents: 0, fpr: 0, total: 0,
      };
      a.rows.push(r);
      a.racePoints += racePointsOf(r);
      a.participation += r.participationPointsAwarded;
      a.penalty += r.manualPenaltyPoints;
      a.incidents += r.incidents;
      agg.set(r.registrationId, a);
    }
    // Steward penalties applied straight away (same rule as the page).
    const immediate =
      !penaltiesScoreToTeam(league.slug) &&
      (isPerRacePenaltySeason(league.slug, season.id) || !sc.deferPenaltyPoints);
    if (immediate) {
      const pens = await prisma.penalty.findMany({
        where: {
          roundId: lastMeta.id,
          type: "POINTS_DEDUCTION",
          pointsValue: { gt: 0 },
          source: { not: "NO_RSVP_NO_SHOW" },
        },
        select: { registrationId: true, pointsValue: true, forgivenPoints: true, autoForgivenPoints: true },
      });
      for (const p of pens) {
        const a = p.registrationId ? agg.get(p.registrationId) : undefined;
        if (!a) continue;
        a.penalty += Math.max(0, (p.pointsValue ?? 0) - (p.forgivenPoints ?? 0) - (p.autoForgivenPoints ?? 0));
      }
    }
    for (const a of agg.values()) {
      const fprEligible = a.rows.length > 0 && a.rows.every((r) => (r.raceDistancePct ?? 0) >= fprMinPct);
      a.fpr = fprEnabled && fprEligible ? fprPointsForIncidents(a.incidents, fprTiers) : 0;
      a.total = a.racePoints + (includeParticipation ? a.participation : 0) + a.fpr - a.penalty;
    }
    const combined = [...agg.values()]
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.incidents - b.incidents ||
          b.racePoints - a.racePoints ||
          b.rows.length - a.rows.length ||
          (a.rows[0]?.registration.user?.lastName ?? "").localeCompare(
            b.rows[0]?.registration.user?.lastName ?? ""
          )
      )
      .map((a, i) => {
        const reg = a.rows[0].registration;
        const byRace = (n: number) => {
          const r = a.rows.find((x) => x.raceNumber === n);
          return r ? { position: r.finishPosition, points: racePointsOf(r), status: r.finishStatus } : null;
        };
        return {
          position: i + 1,
          name: displayName(reg.user),
          countryCode: reg.user?.countryCode ?? null,
          iracingMemberId: reg.user?.iracingMemberId ?? null,
          startNumber: reg.startNumber,
          proAmClass: reg.proAmClass,
          teamName: reg.team?.name ?? null,
          race1: byRace(1),
          race2: byRace(2),
          bonus: (includeParticipation ? a.participation : 0) + a.fpr,
          penalty: a.penalty,
          incidents: a.incidents,
          total: a.total,
        };
      });

    // ---- Driver of the Day (public on the round page) ----
    const dotdRow = await prisma.roundDriverOfTheDay.findUnique({
      where: { roundId: lastMeta.id },
      select: {
        winnerName: true,
        winnerCarNumber: true,
        score: true,
        breakdown: true,
        winnerMetrics: true,
        weights: true,
        ranking: true,
        classWinners: true,
        previousWinnerName: true,
        previousWinnerBlocked: true,
        winnerUser: { select: { countryCode: true } },
      },
    });
    type RankRow = { rank: number; name: string; carNumber: string | null; score: number;
                     eligible: boolean; why: string };
    const driverOfTheDay = dotdRow
      ? {
          winnerName: dotdRow.winnerName,
          winnerCarNumber: dotdRow.winnerCarNumber,
          countryCode: dotdRow.winnerUser?.countryCode ?? null,
          score: dotdRow.score,
          breakdown: dotdRow.breakdown,
          winnerMetrics: dotdRow.winnerMetrics,
          weights: dotdRow.weights,
          classWinners: dotdRow.classWinners,
          runnersUp: ((dotdRow.ranking as RankRow[] | null) ?? [])
            .filter((r) => r.eligible && r.rank > 1)
            .slice(0, 3)
            .map((r) => ({ rank: r.rank, name: r.name, carNumber: r.carNumber, score: r.score, why: r.why })),
          previousWinnerName: dotdRow.previousWinnerName,
          previousWinnerBlocked: dotdRow.previousWinnerBlocked,
        }
      : null;

    lastRound = {
      number: lastMeta.roundNumber,
      name: lastMeta.name,
      track: lastMeta.track,
      trackConfig: lastMeta.trackConfig,
      startsAt: lastMeta.startsAt,
      races: [...byRace.entries()].map(([raceNumber, rows]) => {
        const winnerTime = rows.find((x) => x.finishPosition === 1)?.totalTimeMs ?? null;
        const winnerLaps = rows.find((x) => x.finishPosition === 1)?.lapsCompleted ?? null;
        const laps = rows
          .map((x) => x.bestLapTimeMs)
          .filter((x): x is number => typeof x === "number" && x > 0);
        const fastest = laps.length ? Math.min(...laps) : null;
        return {
          raceNumber,
          results: rows.map((x) => {
            const car = x.car ?? x.registration.car;
            return {
              position: x.finishPosition,
              classPosition: x.classPosition,
              startPosition: x.startPosition,
              name: displayName(x.registration.user),
              countryCode: x.registration.user?.countryCode ?? null,
              iracingMemberId: x.registration.user?.iracingMemberId ?? null,
              startNumber: x.registration.startNumber,
              proAmClass: x.registration.proAmClass,
              teamName: x.registration.team?.name ?? null,
              car: car?.shortName || car?.name || null,
              status: x.finishStatus,
              laps: x.lapsCompleted,
              lapsBehind:
                winnerLaps != null && x.lapsCompleted < winnerLaps
                  ? winnerLaps - x.lapsCompleted
                  : 0,
              gapMs:
                winnerTime != null && x.totalTimeMs != null && winnerLaps === x.lapsCompleted
                  ? x.totalTimeMs - winnerTime
                  : null,
              bestLapMs: x.bestLapTimeMs,
              fastestLap: fastest != null && x.bestLapTimeMs === fastest,
              incidents: x.incidents,
              points: x.rawPointsAwarded,
              penaltyPoints: x.manualPenaltyPoints,
            };
          }),
        };
      }),
      combined,
      driverOfTheDay,
    };
  }

  // ---------- next round: RSVP counts ----------
  const nextMeta = rounds.find((r) => r.status !== "COMPLETED") ?? null;
  let nextRound = null;
  if (nextMeta) {
    const registered = await prisma.registration.findMany({
      where: { seasonId: season.id, status: "APPROVED", isTeamManager: false },
      select: { id: true },
    });
    const regIds = new Set(registered.map((r) => r.id));
    const rsvps = await prisma.roundRsvp.findMany({
      where: { roundId: nextMeta.id },
      select: { registrationId: true, status: true },
    });
    const counted = rsvps.filter((r) => regIds.has(r.registrationId));
    const accepted = counted.filter((r) => r.status === "ACCEPTED").length;
    const declined = counted.filter((r) => r.status === "DECLINED").length;
    const tentative = counted.filter((r) => r.status === "TENTATIVE").length;
    nextRound = {
      number: nextMeta.roundNumber,
      name: nextMeta.name,
      track: nextMeta.track,
      trackConfig: nextMeta.trackConfig,
      startsAt: nextMeta.startsAt,
      status: nextMeta.status,
      rsvp: {
        registered: regIds.size,
        accepted,
        declined,
        tentative,
        noResponse: Math.max(0, regIds.size - accepted - declined - tentative),
        closed: nextMeta.rsvpClosedAt != null,
      },
    };
  }

  // ---------- participation per completed round + season totals ----------
  const countedRounds = completed.filter((r) => r.countsForChampionship);
  const partRows = await prisma.raceResult.findMany({
    where: { roundId: { in: countedRounds.map((r) => r.id) } },
    select: {
      roundId: true,
      registrationId: true,
      finishStatus: true,
      lapsCompleted: true,
      incidents: true,
    },
  });
  const perRound = rounds
    .filter((r) => r.countsForChampionship)
    .map((r) => {
      const rows = partRows.filter((x) => x.roundId === r.id);
      return {
        number: r.roundNumber,
        name: r.name,
        status: r.status,
        entries: new Set(rows.map((x) => x.registrationId)).size,
        finishers: rows.filter((x) => x.finishStatus === "CLASSIFIED").length,
        hasResults: rows.length > 0,
      };
    });
  const withResults = perRound.filter((r) => r.hasResults);
  const approvedDrivers = await prisma.registration.count({
    where: { seasonId: season.id, status: "APPROVED", isTeamManager: false },
  });
  const totalLaps = partRows.reduce((s, x) => s + x.lapsCompleted, 0);
  const totalIncidents = partRows.reduce((s, x) => s + x.incidents, 0);

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      league: { slug: league.slug, name: league.name },
      season: {
        id: season.id,
        name: season.name,
        totalRounds: rounds.length,
        completedRounds: completed.length,
      },
      rounds: rounds.map((r) => ({
        number: r.roundNumber,
        name: r.name,
        status: r.status,
        startsAt: r.startsAt,
      })),
      lastRound,
      nextRound,
      participation: {
        rounds: perRound.map((r) => ({
          number: r.number,
          name: r.name,
          status: r.status,
          entries: r.entries,
          finishers: r.finishers,
        })),
        totals: {
          drivers: approvedDrivers,
          avgGrid:
            withResults.length > 0
              ? withResults.reduce((s, r) => s + r.entries, 0) / withResults.length
              : 0,
          totalEntries: partRows.length,
          totalLaps,
          totalIncidents,
          avgIncidentsPerEntry:
            partRows.length > 0 ? totalIncidents / partRows.length : 0,
        },
      },
    },
    { headers: CORS_HEADERS }
  );
}
