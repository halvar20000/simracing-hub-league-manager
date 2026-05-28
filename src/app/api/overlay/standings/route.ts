/**
 * Public read-only standings endpoint for the iRacing OBS championship overlay.
 *
 * Returns the current driver championship standings for a given league/season,
 * plus the scoring table and per-driver iRacing customer IDs so the overlay
 * can (a) match telemetry drivers to championship rows and (b) project
 * post-race championship points from live race positions.
 *
 * Unauthenticated, CORS-open, cached briefly at the edge. Consumed by
 * `iracing_championship.py` running on the user's streaming PC.
 *
 * Query params:
 *   - league   (required) — League.slug, e.g. "cas-gt3-wct"
 *   - season   (optional) — Season.id; if omitted, picks the ACTIVE season
 *                           for the league (falls back to OPEN_REGISTRATION)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDriverStandings } from "@/lib/standings";

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

  // Resolve season — explicit id wins, otherwise pick the most recently
  // started ACTIVE/OPEN_REGISTRATION season for this league.
  let season;
  if (seasonIdParam) {
    season = await prisma.season.findFirst({
      where: { id: seasonIdParam, leagueId: league.id },
      include: { scoringSystem: true, league: { select: { slug: true, name: true } } },
    });
  } else {
    season = await prisma.season.findFirst({
      where: {
        leagueId: league.id,
        status: { in: ["ACTIVE", "OPEN_REGISTRATION"] },
      },
      orderBy: { startsOn: "desc" },
      include: { scoringSystem: true, league: { select: { slug: true, name: true } } },
    });
  }
  if (!season) {
    return NextResponse.json(
      { ok: false, error: `No active season found for league ${leagueSlug}` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Compute championship standings the same way the public site does.
  const standings = await computeDriverStandings(prisma, season.id);

  // Pull each registration's User.iracingMemberId so the overlay can match
  // telemetry drivers to championship rows. computeDriverStandings doesn't
  // include this field, so we do a focused side-query keyed by registrationId.
  const regIds = standings.map((s) => s.registrationId);
  const regs = await prisma.registration.findMany({
    where: { id: { in: regIds } },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          iracingMemberId: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
  const regToUser = new Map(regs.map((r) => [r.id, r.user]));

  // Round metadata — total count + how many are completed, so the overlay
  // can show "Round 5 of 10" or grey out scoring rows beyond the current event.
  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id },
    orderBy: { roundNumber: "asc" },
    select: {
      id: true,
      roundNumber: true,
      name: true,
      status: true,
      startsAt: true,
    },
  });
  const completedRounds = rounds.filter((r) => r.status === "COMPLETED").length;

  // Build the response. Keep field names compact and stable — the Python
  // overlay parses this directly.
  const pointsTable = (season.scoringSystem?.pointsTable ?? {}) as Record<
    string,
    number
  >;
  const classPointsTable =
    (season.scoringSystem?.classPointsTable as Record<string, number> | null) ??
    pointsTable;

  const responseBody = {
    ok: true,
    generatedAt: new Date().toISOString(),
    league: { slug: league.slug, name: league.name },
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      isMulticlass: season.isMulticlass,
      proAmEnabled: season.proAmEnabled,
      totalRounds: rounds.length,
      completedRounds,
    },
    scoring: {
      pointsTable, // { "1": 25, "2": 18, ... } — overall race position
      classPointsTable, // for Pro/Am or class-relative scoring
      participationPoints: season.scoringSystem?.participationPoints ?? 0,
      dropWorstNRounds: season.scoringSystem?.dropWorstNRounds ?? 0,
    },
    rounds: rounds.map((r) => ({
      id: r.id,
      number: r.roundNumber,
      name: r.name,
      status: r.status,
      startsAt: r.startsAt,
    })),
    standings: standings.map((s, idx) => {
      const u = regToUser.get(s.registrationId);
      return {
        rank: idx + 1, // pre-race championship position (1 = leader)
        registrationId: s.registrationId,
        userId: u?.id ?? null,
        iracingMemberId: u?.iracingMemberId ?? null, // <-- match key
        name:
          [s.driverFirstName, s.driverLastName].filter(Boolean).join(" ") ||
          u?.name ||
          "—",
        firstName: s.driverFirstName,
        lastName: s.driverLastName,
        countryCode: s.countryCode,
        startNumber: s.startNumber,
        teamId: s.teamId,
        teamName: s.teamName,
        carClassId: s.carClassId,
        carClassName: s.carClassName,
        proAmClass: s.proAmClass, // "PRO" | "AM" | null
        inGdc: s.inGdc,
        points: s.classTotal, // primary championship total
        rawPoints: s.rawPoints,
        classRawPoints: s.classRawPoints,
        combinedTotal: s.combinedTotal,
        participationPoints: s.participationPoints,
        manualPenalties: s.manualPenalties,
        totalIncidents: s.totalIncidents,
        iRating: s.iRating,
        roundsCompleted: s.roundsCompleted,
        excludedAt: s.excludedAt,
      };
    }),
  };

  return NextResponse.json(responseBody, { headers: CORS_HEADERS });
}
