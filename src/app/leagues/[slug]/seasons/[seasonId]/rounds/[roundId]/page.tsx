import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMsToTime } from "@/lib/time";
import { CountryFlag } from "@/components/CountryFlag";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { protestWindowState, formatCountdown } from "@/lib/protest-window";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";
import { EmptyState, FlagIcon } from "@/components/EmptyState";
import { RoundPodium } from "@/components/RoundPodium";
import { RsvpWidget } from "@/components/RsvpWidget";
import { isRsvpClosed } from "@/lib/rsvp-window";
import { readDriverFprTiers, fprPointsForIncidents } from "@/lib/driver-fpr";
import { RaceCenterView } from "@/components/RaceCenterView";

type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2" | "quali" | "car" | "teams" | "race-center";
const TEAM_BEST_N = 2;

function sortByFinish<R extends { finishStatus: string; finishPosition: number }>(
  rows: R[]
): R[] {
  return [...rows].sort((a, b) => {
    if (a.finishStatus !== b.finishStatus) {
      if (a.finishStatus === "CLASSIFIED") return -1;
      if (b.finishStatus === "CLASSIFIED") return 1;
    }
    return a.finishPosition - b.finishPosition;
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId, roundId } = await params;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true, scoringSystem: true } },
      raceResults: {
        include: { registration: { include: { user: true } } },
      },
    },
  });
  if (
    !round ||
    round.season.league.slug !== slug ||
    round.seasonId !== seasonId
  ) {
    return { title: "Round not found" };
  }

  // Mirror standings.ts: participation only counts toward combined when the
  // scoring-system flag is on (e.g. GT3 WCT has it off).
  const includeParticipationInCombinedMeta =
    round.season.scoringSystem.participationInCombined ?? true;

  // Compute top 3 by aggregated round total (handles multi-race)
  type Agg = {
    name: string;
    total: number;
    classified: boolean;
  };
  const m = new Map<string, Agg>();
  for (const r of round.raceResults) {
    const name = (
      `${r.registration.user.firstName ?? ""} ${r.registration.user.lastName ?? ""}`
    ).trim();
    let a = m.get(r.registrationId);
    if (!a) {
      a = { name, total: 0, classified: false };
      m.set(r.registrationId, a);
    }
    a.total +=
      r.rawPointsAwarded +
      (includeParticipationInCombinedMeta ? r.participationPointsAwarded : 0) -
      r.manualPenaltyPoints +
      (r.correctionPoints ?? 0);
    if (r.finishStatus === "CLASSIFIED") a.classified = true;
  }
  const top3 = [...m.values()]
    .filter((a) => a.classified)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const title = `${round.season.league.name} R${round.roundNumber} — ${round.track}`;
  const description =
    top3.length === 3
      ? `🥇 ${top3[0].name} · 🥈 ${top3[1].name} · 🥉 ${top3[2].name}`
      : `${round.name} · ${round.season.name} ${round.season.year}`;
  const image = round.season.league.logoUrl ?? "/logos/cas-community.webp";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ cls?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { cls: clsRaw } = await searchParams;

  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true, scoringSystem: true } },
      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true, carClass: true },
          },
        },
        orderBy: [
          { raceNumber: "asc" },
          { finishStatus: "asc" },
          { finishPosition: "asc" },
        ],
      },
      fprAwards: { include: { team: true, carClass: true } },
      raceCenter: {
        include: {
          charts: { orderBy: { sortOrder: "asc" } },
          comebackUser: { select: { id: true, firstName: true, lastName: true, name: true, countryCode: true } },
        },
      },
    },
  });
  if (
    !round ||
    round.season.league.slug !== slug ||
    round.seasonId !== seasonId
  ) {
    notFound();
  }

  // RSVP context for the signed-in driver (UPCOMING rounds only).
  let driverRsvpStatus: "ACCEPTED" | "DECLINED" | "TENTATIVE" | null = null;
  let driverIsRegistered = false;
  if (sessionUserId && round.status === "UPCOMING") {
    const reg = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId, userId: sessionUserId } },
      select: { id: true, excludedAt: true },
    });
    driverIsRegistered = !!reg && !reg.excludedAt;
    if (reg) {
      const rsvp = await prisma.roundRsvp.findUnique({
        where: {
          roundId_registrationId: { roundId: round.id, registrationId: reg.id },
        },
        select: { status: true },
      });
      driverRsvpStatus = rsvp?.status ?? null;
    }
  }

  const isMulticlass = round.season.isMulticlass;
  const proAmEnabled = round.season.proAmEnabled;
  // Mirror standings.ts: when participationInCombined is false (e.g. GT3 WCT),
  // participation points are EXCLUDED from the Combined / Race 1 / Race 2 /
  // By Car totals. Pro/Am tabs still include participation because the
  // standings engine's classTotal is not gated by this flag.
  const includeParticipationInCombined =
    round.season.scoringSystem.participationInCombined ?? true;
  const teamResultsForRound = await prisma.teamResult.findMany({
    where: { roundId: round.id },
    include: {
      team: { select: { id: true, name: true } },
      carClass: { select: { id: true, name: true, shortCode: true, displayOrder: true } },
      participations: {
        include: {
          registration: {
            include: {
              user: { select: { firstName: true, lastName: true, countryCode: true } },
            },
          },
        },
      },
    },
    orderBy: [{ classPosition: "asc" }, { finishPosition: "asc" }],
  });
  const hasTeamData = teamResultsForRound.length > 0;
  const racesPerRound = round.season.scoringSystem.racesPerRound ?? 1;
  const isMultiRace = racesPerRound > 1;

  // Lookup tables for the team-event team tables.
  //   - raceResultByRegId: a registration's race-1 result for this round
  //     (provides qualifyingTimeMs per driver and the driver's identity).
  //   - fprByTeamAndClass: FPR-award points per (teamId, carClassId) for
  //     the "Bonus Pts" column.
  const raceResultByRegId = new Map<
    string,
    {
      qualifyingTimeMs: number | null;
      bestLapTimeMs: number | null;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
    }
  >();
  for (const rr of round.raceResults) {
    if (rr.raceNumber !== 1 && raceResultByRegId.has(rr.registrationId)) continue;
    raceResultByRegId.set(rr.registrationId, {
      qualifyingTimeMs: rr.qualifyingTimeMs,
      bestLapTimeMs: rr.bestLapTimeMs,
      firstName: rr.registration.user.firstName,
      lastName: rr.registration.user.lastName,
      countryCode: rr.registration.user.countryCode,
    });
  }
  const fprByTeamAndClass = new Map<string, number>();
  for (const a of round.fprAwards) {
    fprByTeamAndClass.set(
      `${a.teamId}::${a.carClassId ?? ""}`,
      a.fprPointsAwarded
    );
  }
  // Reuse the same fallback the standings engine uses: when TeamResult
  // rawPointsAwarded is 0 (typical for IEC imports), derive race points
  // from scoringSystem.pointsTable[classPosition].
  const seasonPointsTable = (round.season.scoringSystem.pointsTable ?? {}) as Record<string, number>;
  // Scoring flags used by both team tables to derive participation + FPR
  // the same way computeTeamClassStandings does in src/lib/standings.ts.
  const teamScoringFlags = {
    participationPoints: round.season.scoringSystem.participationPoints ?? 0,
    participationMinDistancePct:
      round.season.scoringSystem.participationMinDistancePct ?? 75,
    racePointsMinDistancePct:
      round.season.scoringSystem.racePointsMinDistancePct ?? 50,
    driverFprEnabled: !!round.season.scoringSystem.driverFprEnabled,
    driverFprTiers: round.season.scoringSystem.driverFprEnabled
      ? readDriverFprTiers(round.season.scoringSystem.driverFprTiers)
      : [],
    driverFprMinDistancePct:
      round.season.scoringSystem.driverFprMinDistancePct ?? 90,
  };

  // For team-event rounds (e.g. IEC), build the list of car classes present
  // in this round's team results, sorted by displayOrder. Each becomes its
  // own tab on the page; the cls URL param holds the carClass shortCode.
  type RoundTeamClass = {
    id: string;
    name: string;
    shortCode: string;
    displayOrder: number;
  };
  const roundTeamClassesById = new Map<string, RoundTeamClass>();
  for (const tr of teamResultsForRound) {
    if (tr.carClass && !roundTeamClassesById.has(tr.carClass.id)) {
      roundTeamClassesById.set(tr.carClass.id, tr.carClass);
    }
  }
  const roundTeamClasses = [...roundTeamClassesById.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
  );
  const teamClassByCode = new Map(
    roundTeamClasses.map((c) => [c.shortCode.toUpperCase(), c])
  );
  const defaultTeamClass: RoundTeamClass | null = roundTeamClasses[0] ?? null;
  const selectedTeamClass: RoundTeamClass | null = hasTeamData
    ? teamClassByCode.get((clsRaw ?? "").toUpperCase()) ??
      defaultTeamClass
    : null;

  // Team-event rounds (e.g. IEC) collapse to the class/team grouping only —
  // mirrors the standings page behaviour. All driver-centric tabs are hidden.
  const defaultCls: Cls = hasTeamData ? "teams" : "combined";
  const cls: Cls =
    // In team mode, the clsRaw is a carClass shortCode (e.g. "GTP"), not one
    // of the legacy tab keys. Treat it as the team-mode marker.
    hasTeamData && selectedTeamClass
      ? "teams"
      : clsRaw === "pro"
        ? "pro"
        : clsRaw === "am"
          ? "am"
          : clsRaw === "team"
            ? "team"
            : clsRaw === "race1"
              ? "race1"
              : clsRaw === "race2"
                ? "race2"
                : clsRaw === "quali"
                  ? "quali"
                  : clsRaw === "car"
                    ? "car"
                    : clsRaw === "teams"
                      ? "teams"
                      : clsRaw === "race-center"
                        ? "race-center"
                        : defaultCls;

  const baseHref = `/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;
  const allRows = round.raceResults;

  // ---- Pro/Am class-relative race points -------------------------------
  // For Pro/Am seasons (GT3 WCT), championship race points come from the
  // driver's position WITHIN their Pro/Am class, NOT their overall
  // finishing position. The stored RaceResult.rawPointsAwarded reflects
  // the overall position, so the round result tables would otherwise
  // disagree with the standings page (which recomputes class-relative
  // points). Replicate the standings logic here so the numbers match.
  //
  //   classRacePointsByResult: resultId -> race points (before
  //   participation / penalty). null when the season isn't Pro/Am — in
  //   that case rawPointsAwarded is already correct.
  let classRacePointsByResult: Map<string, number> | null = null;
  if (proAmEnabled) {
    classRacePointsByResult = new Map<string, number>();
    const minPct =
      round.season.scoringSystem.racePointsMinDistancePct ?? 50;
    // Same eligibility filter + ranking as src/lib/standings.ts: only
    // non-DSQ/DNS results above the distance threshold are ranked,
    // sorted by overall finish position, then numbered per class.
    const classified = [...allRows]
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
      let rank: number | null = null;
      if (cls === "PRO") rank = ++proRank;
      else if (cls === "AM") rank = ++amRank;
      if (rank != null) {
        classRacePointsByResult.set(
          r.id,
          seasonPointsTable[String(rank)] ?? 0
        );
      }
    }
  }
  // Race points for a single result — class-relative when Pro/Am,
  // otherwise the stored overall-position value. Fallback to
  // rawPointsAwarded when a result has no class rank (matches the
  // standings engine: e.g. a classified driver with no Pro/Am class
  // assigned still scores their overall-position points).
  const racePointsOf = (r: { id: string; rawPointsAwarded: number }): number =>
    classRacePointsByResult
      ? classRacePointsByResult.get(r.id) ?? r.rawPointsAwarded
      : r.rawPointsAwarded;

  // For multi-race rounds, the per-race row sets
  const race1Rows = sortByFinish(allRows.filter((r) => r.raceNumber === 1));
  const race2Rows = sortByFinish(allRows.filter((r) => r.raceNumber === 2));

  // Aggregate per driver for the Combined / Team views (works for both
  // single-race and multi-race rounds).
  type Agg = {
    registrationId: string;
    rows: typeof allRows;
    raceResultsByNumber: Map<number, (typeof allRows)[number]>;
    racePoints: number;            // sum of rawPointsAwarded
    participationPoints: number;
    penaltyPoints: number;
    totalPoints: number;
    incidents: number;
  };
  const aggMap = new Map<string, Agg>();
  for (const r of allRows) {
    let a = aggMap.get(r.registrationId);
    if (!a) {
      a = {
        registrationId: r.registrationId,
        rows: [],
        raceResultsByNumber: new Map(),
        racePoints: 0,
        participationPoints: 0,
        penaltyPoints: 0,
        totalPoints: 0,
        incidents: 0,
      };
      aggMap.set(r.registrationId, a);
    }
    a.rows.push(r);
    a.raceResultsByNumber.set(r.raceNumber, r);
    a.racePoints += racePointsOf(r);
    a.participationPoints += r.participationPointsAwarded;
    a.penaltyPoints += r.manualPenaltyPoints;
    a.incidents += r.incidents;
  }
  for (const a of aggMap.values()) {
    a.totalPoints =
      a.racePoints +
      (includeParticipationInCombined ? a.participationPoints : 0) -
      a.penaltyPoints;
  }
  const aggRows = [...aggMap.values()].sort(
    (a, b) => b.totalPoints - a.totalPoints
  );

  // Pro / Am views still operate on per-race-result rows
  const proRows = sortByFinish(
    allRows.filter((r) => r.registration.carClass?.shortCode === "PRO")
  );
  const amRows = sortByFinish(
    allRows.filter((r) => r.registration.carClass?.shortCode === "AM")
  );

  // Team groupings (aggregated across all the team's drivers, multi-race aware)
  type TeamRow = {
    teamName: string;
    drivers: Agg[];
    topNTotal: number;
    bestFinish: number | null;
  };
  const byTeam = new Map<string, Agg[]>();
  for (const a of aggRows) {
    // Use the lowest-raceNumber row for team / class info
    const sample = a.rows[0];
    const key = sample.registration.team?.name ?? "Independent";
    const arr = byTeam.get(key);
    if (arr) arr.push(a);
    else byTeam.set(key, [a]);
  }
  const teamRows: TeamRow[] = [...byTeam.entries()]
    .map(([teamName, drivers]) => {
      const byPts = [...drivers].sort((a, b) => b.totalPoints - a.totalPoints);
      const topN = byPts.slice(0, TEAM_BEST_N);
      const topNTotal = topN.reduce((s, d) => s + d.totalPoints, 0);
      const classifieds = drivers.flatMap((d) =>
        d.rows.filter((r) => r.finishStatus === "CLASSIFIED")
      );
      const bestFinish =
        classifieds.length > 0
          ? Math.min(...classifieds.map((r) => r.finishPosition))
          : null;
      return { teamName, drivers: byPts, topNTotal, bestFinish };
    })
    .sort((a, b) => b.topNTotal - a.topNTotal);

  // Combined-view "winner" (overall leader) for gap calc — only meaningful
  // for single-race rounds today
  const combinedWinner = !isMultiRace
    ? allRows.find(
        (r) => r.finishStatus === "CLASSIFIED" && r.finishPosition === 1
      )
    : null;

  const pillBase = "rounded px-3 py-1.5 transition-colors";
  const pillOn = "bg-[#ff6b35] text-zinc-950";
  const pillOff = "text-zinc-300 hover:text-zinc-100";

  // Top 3 podium for the Combined view. Filter to drivers who have at least
  // one CLASSIFIED race; sort is already done by aggRows (totalPoints desc).
  const podium = aggRows
    .filter((a) => a.rows.some((r) => r.finishStatus === "CLASSIFIED"))
    .slice(0, 3)
    .map((a, i) => {
      const sample = a.rows[0];
      return {
        rank: i + 1,
        firstName: sample.registration.user.firstName,
        lastName: sample.registration.user.lastName,
        countryCode: sample.registration.user.countryCode ?? null,
        startNumber: sample.registration.startNumber,
        teamName: sample.registration.team?.name ?? null,
        carClassName: sample.registration.carClass?.name ?? null,
        totalPoints: a.totalPoints,
        raceBreakdown: [...a.rows]
          .sort((x, y) => x.raceNumber - y.raceNumber)
          .map((r) => ({ raceNumber: r.raceNumber, finishPosition: r.finishPosition })),
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            R{round.roundNumber} — {round.name}
          </h1>
          <p className="text-sm text-zinc-400">
            {round.track}
            {round.trackConfig ? ` (${round.trackConfig})` : ""}
            {" • "}
            {formatDateTime(round.startsAt)}
            {isMulticlass && " • Multiclass"}
            {isMultiRace && ` • ${racesPerRound} races per round`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyLinkButton />
          <ReportButton
            href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/report`}
            window={protestWindowState({
              raceStartsAt: round.startsAt,
              protestCooldownHours: round.season.scoringSystem.protestCooldownHours,
              protestWindowHours: round.season.scoringSystem.protestWindowHours,
            })}
          />
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-100"
          >
            ← Season
          </Link>
        </div>
      </div>

      {sessionUserId && round.status === "UPCOMING" && (
        <RsvpWidget
          roundId={round.id}
          roundStatus={round.status}
          currentStatus={driverRsvpStatus}
          isRegistered={driverIsRegistered}
          rsvpMode={round.season.league.rsvpMode}
          isClosed={isRsvpClosed({
            startsAt: round.startsAt,
            status: round.status,
            rsvpCloseBeforeHours: round.season.league.rsvpCloseBeforeHours,
          })}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        {hasTeamData ? (
          // Team-event rounds (IEC): one tab per car class. Each tab shows
          // team race results above and team qualifying below.
          roundTeamClasses.map((c) => {
            const active = selectedTeamClass?.id === c.id;
            return (
              <Link
                key={c.id}
                href={`${baseHref}?cls=${encodeURIComponent(c.shortCode)}`}
                className={`${pillBase} ${active ? pillOn : pillOff}`}
              >
                {c.name}
              </Link>
            );
          })
        ) : (
          <>
            <Link
              href={baseHref}
              className={`${pillBase} ${cls === "combined" ? pillOn : pillOff}`}
            >
              Combined
            </Link>
            <Link
              href={`${baseHref}?cls=quali`}
              className={`${pillBase} ${cls === "quali" ? pillOn : pillOff}`}
            >
              Quali
            </Link>
            {isMultiRace && (
              <>
                <Link
                  href={`${baseHref}?cls=race1`}
                  className={`${pillBase} ${cls === "race1" ? pillOn : pillOff}`}
                >
                  Race 1
                </Link>
                <Link
                  href={`${baseHref}?cls=race2`}
                  className={`${pillBase} ${cls === "race2" ? pillOn : pillOff}`}
                >
                  Race 2
                </Link>
              </>
            )}
            {proAmEnabled && (
              <>
                <Link
                  href={`${baseHref}?cls=pro`}
                  className={`${pillBase} ${cls === "pro" ? pillOn : pillOff}`}
                >
                  Pro
                </Link>
                <Link
                  href={`${baseHref}?cls=am`}
                  className={`${pillBase} ${cls === "am" ? pillOn : pillOff}`}
                >
                  Am
                </Link>
              </>
            )}
            <Link
              href={`${baseHref}?cls=team`}
              className={`${pillBase} ${cls === "team" ? pillOn : pillOff}`}
            >
              Team
            </Link>
            <Link
              href={`${baseHref}?cls=car`}
              className={`${pillBase} ${cls === "car" ? pillOn : pillOff}`}
            >
              By Car
            </Link>
          </>
        )}
        {round.raceCenter?.publishedAt && (
          <Link
            href={`${baseHref}?cls=race-center`}
            className={`${pillBase} ${cls === "race-center" ? pillOn : pillOff} border border-red-700/40 text-red-200`}
          >
            📝 Race Center
          </Link>
        )}
        <span className="mx-2 text-zinc-700" aria-hidden="true">|</span>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}/standings`}
          className={`${pillBase} ${pillOff}`}
        >
          Standings →
        </Link>
      </div>

      {cls === "race-center" && round.raceCenter && round.raceCenter.publishedAt && (
        <RaceCenterView
          raceCenter={round.raceCenter}
          raceResults={round.raceResults}
          roundName={round.name}
          roundNumber={round.roundNumber}
          startsAt={round.startsAt}
        />
      )}

      {cls !== "race-center" && !hasTeamData && cls === "combined" && podium.length > 0 && (
        <RoundPodium
          drivers={podium}
          isMultiRace={isMultiRace}
          isMulticlass={isMulticlass}
        />
      )}

      {cls !== "race-center" && (
      <>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Race results</h2>
        {allRows.length === 0 && !hasTeamData ? (
          <EmptyState
            icon={<FlagIcon />}
            title="No results entered yet"
            description="Once race results are imported, they will appear here."
          />
        ) : cls === "teams" && selectedTeamClass ? (
          <RoundTeamRaceTable
            teamResults={teamResultsForRound.filter(
              (tr) => tr.carClass?.id === selectedTeamClass.id
            )}
            raceResultByRegId={raceResultByRegId}
            fprByTeamAndClass={fprByTeamAndClass}
            selectedClassId={selectedTeamClass.id}
            pointsTable={seasonPointsTable}
            scoring={teamScoringFlags}
          />
        ) : cls === "teams" ? (
          <RoundTeamSection teamResults={teamResultsForRound} />
        ) : cls === "quali" ? (
          <QualifyingTable rows={aggRows} isMulticlass={isMulticlass} />
        ) : cls === "team" ? (
          <TeamView
            teams={teamRows}
            isMulticlass={isMulticlass}
            isMultiRace={isMultiRace}
          />
        ) : cls === "race1" ? (
          <ResultsTable
            rows={race1Rows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            heading="Race 1"
            classRacePoints={classRacePointsByResult}
            includeParticipation={includeParticipationInCombined}
          />
        ) : cls === "race2" ? (
          <ResultsTable
            rows={race2Rows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            heading="Race 2"
            classRacePoints={classRacePointsByResult}
            includeParticipation={includeParticipationInCombined}
          />
        ) : cls === "pro" ? (
          <ResultsTable
            rows={proRows}
            isMulticlass={false}
            renumberWithinGroup
            classRacePoints={classRacePointsByResult}
            includeParticipation={true}
          />
        ) : cls === "am" ? (
          <ResultsTable
            rows={amRows}
            isMulticlass={false}
            renumberWithinGroup
            classRacePoints={classRacePointsByResult}
            includeParticipation={true}
          />
        ) : isMultiRace ? (
          <CombinedMultiRaceTable
            rows={aggRows}
            isMulticlass={isMulticlass}
            racesPerRound={racesPerRound}
            classRacePoints={classRacePointsByResult}
          />
        ) : (
          <ResultsTable
            rows={allRows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            winnerTotalTimeMs={combinedWinner?.totalTimeMs ?? null}
            classRacePoints={classRacePointsByResult}
            includeParticipation={includeParticipationInCombined}
          />
        )}
      </section>

      {hasTeamData && selectedTeamClass && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Qualifying — {selectedTeamClass.name}</h2>
          <RoundTeamQualiTable
            teamResults={teamResultsForRound.filter(
              (tr) => tr.carClass?.id === selectedTeamClass.id
            )}
            raceResultByRegId={raceResultByRegId}
            fprByTeamAndClass={fprByTeamAndClass}
            selectedClassId={selectedTeamClass.id}
            pointsTable={seasonPointsTable}
            scoring={teamScoringFlags}
          />
        </section>
      )}

      {!hasTeamData && round.fprAwards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">FPR awards</h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 driver-col">Team</th>
                  {isMulticlass && <th className="px-3 py-2">Class</th>}
                  <th className="px-3 py-2 text-right">Team incidents</th>
                  <th className="px-3 py-2 text-right">FPR pts</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-medium driver-col">{a.team.name}</td>
                    {isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {a.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                      {a.teamIncidentTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-400 tabular-nums">
                      {a.fprPointsAwarded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </>
      )}
    </div>
  );
}

type Row = {
  id: string;
  raceNumber: number;
  finishStatus: string;
  finishPosition: number;
  startPosition: number | null;
  qualifyingTimeMs: number | null;
  bestLapTimeMs: number | null;
  totalTimeMs: number | null;
  lapsCompleted: number;
  incidents: number;
  rawPointsAwarded: number;
  participationPointsAwarded: number;
  manualPenaltyPoints: number;
  registration: {
    startNumber: number | null;
    user: { firstName: string | null; lastName: string | null; countryCode: string | null };
    team: { name: string } | null;
    carClass: { name: string } | null;
    excludedAt: Date | null;
  };
};

function ResultsTable({
  rows,
  isMulticlass,
  renumberWithinGroup,
  winnerTotalTimeMs = null,
  heading = null,
  classRacePoints = null,
  includeParticipation = true,
}: {
  rows: Row[];
  isMulticlass: boolean;
  renumberWithinGroup: boolean;
  winnerTotalTimeMs?: number | null;
  heading?: string | null;
  /** Pro/Am class-relative race points by result id. When provided,
   * the Pts column uses these instead of the stored (overall-position)
   * rawPointsAwarded so it matches the standings. */
  classRacePoints?: Map<string, number> | null;
  /** When false, participation points are excluded from the Pts column.
   * Mirrors ScoringSystem.participationInCombined. Pro/Am tabs always
   * pass true (matches standings classTotal). */
  includeParticipation?: boolean;
}) {
  const groupWinnerTotalTimeMs = renumberWithinGroup
    ? rows.find(
        (r) => r.finishStatus === "CLASSIFIED" && r.totalTimeMs != null
      )?.totalTimeMs ?? null
    : winnerTotalTimeMs;
  let classifiedCount = 0;
  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      {heading && (
        <div className="bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          {heading}
        </div>
      )}
      <table className="w-full text-sm freeze-driver-col">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Grid</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2 driver-col">Driver</th>
            <th className="px-3 py-2">Team</th>
            {isMulticlass && <th className="px-3 py-2">Class</th>}
            <th className="px-3 py-2 text-right">Laps</th>
            <th className="px-3 py-2 text-right">Time</th>
            <th className="px-3 py-2 text-right">Quali</th>
            <th className="px-3 py-2 text-right">Best lap</th>
            <th className="px-3 py-2 text-right">Inc</th>
            <th className="px-3 py-2 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const racePts = classRacePoints
              ? classRacePoints.get(r.id) ?? r.rawPointsAwarded
              : r.rawPointsAwarded;
            const total =
              racePts +
              (includeParticipation ? r.participationPointsAwarded : 0) -
              r.manualPenaltyPoints;
            const gap =
              groupWinnerTotalTimeMs && r.totalTimeMs
                ? r.totalTimeMs - groupWinnerTotalTimeMs
                : null;
            let displayPos: string | number = r.finishStatus;
            if (r.finishStatus === "CLASSIFIED") {
              if (renumberWithinGroup) {
                classifiedCount += 1;
                displayPos = classifiedCount;
              } else {
                displayPos = r.finishPosition;
              }
            }
            return (
              <tr
                key={r.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">{displayPos}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {r.startPosition ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {r.registration.startNumber ?? "—"}
                </td>
                <td
                  className={`px-3 py-2 driver-col ${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}
                >
                  <CountryFlag code={r.registration.user.countryCode} />
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}
                  {r.registration.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {r.registration.team?.name ?? "—"}
                </td>
                {isMulticlass && (
                  <td className="px-3 py-2 text-zinc-400">
                    {r.registration.carClass?.name ?? "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-right text-zinc-400">
                  {r.lapsCompleted}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {r.finishStatus === "CLASSIFIED" && r.totalTimeMs
                    ? formatMsToTime(r.totalTimeMs)
                    : r.finishStatus === "CLASSIFIED" && gap != null
                      ? `+${formatMsToTime(gap)}`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {formatMsToTime(r.qualifyingTimeMs) || "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {formatMsToTime(r.bestLapTimeMs) || "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400">
                  {r.incidents}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-orange-400">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Agg = {
  registrationId: string;
  rows: Row[];
  raceResultsByNumber: Map<number, Row>;
  racePoints: number;
  participationPoints: number;
  penaltyPoints: number;
  totalPoints: number;
  incidents: number;
};

function CombinedMultiRaceTable({
  rows,
  isMulticlass,
  racesPerRound,
  classRacePoints = null,
}: {
  rows: Agg[];
  isMulticlass: boolean;
  racesPerRound: number;
  /** Pro/Am class-relative race points by result id (see ResultsTable). */
  classRacePoints?: Map<string, number> | null;
}) {
  const raceNumbers = Array.from({ length: racesPerRound }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="w-full text-sm freeze-driver-col">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2 driver-col">Driver</th>
            <th className="px-3 py-2">Team</th>
            {isMulticlass && <th className="px-3 py-2">Class</th>}
            {raceNumbers.map((n) => (
              <th key={n} className="px-3 py-2 text-right">
                R{n} pos
              </th>
            ))}
            {raceNumbers.map((n) => (
              <th key={`p${n}`} className="px-3 py-2 text-right">
                R{n} pts
              </th>
            ))}
            <th className="px-3 py-2 text-right">Bonus</th>
            <th className="px-3 py-2 text-right">Pen</th>
            <th className="px-3 py-2 text-right">Inc</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, idx) => {
            const sample = a.rows[0];
            return (
              <tr
                key={a.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">{idx + 1}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {sample.registration.startNumber ?? "—"}
                </td>
                <td
                  className={`px-3 py-2 driver-col ${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}
                >
                  <CountryFlag code={sample.registration.user.countryCode} />
                  {sample.registration.user.firstName}{" "}
                  {sample.registration.user.lastName}
                  {sample.registration.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {sample.registration.team?.name ?? "—"}
                </td>
                {isMulticlass && (
                  <td className="px-3 py-2 text-zinc-400">
                    {sample.registration.carClass?.name ?? "—"}
                  </td>
                )}
                {raceNumbers.map((n) => {
                  const r = a.raceResultsByNumber.get(n);
                  return (
                    <td
                      key={n}
                      className="px-3 py-2 text-right text-zinc-400 tabular-nums"
                    >
                      {r
                        ? r.finishStatus === "CLASSIFIED"
                          ? r.finishPosition
                          : r.finishStatus
                        : "—"}
                    </td>
                  );
                })}
                {raceNumbers.map((n) => {
                  const r = a.raceResultsByNumber.get(n);
                  return (
                    <td
                      key={`p${n}`}
                      className="px-3 py-2 text-right text-zinc-300 tabular-nums"
                    >
                      {r
                        ? classRacePoints
                          ? classRacePoints.get(r.id) ?? r.rawPointsAwarded
                          : r.rawPointsAwarded
                        : 0}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">
                  {a.participationPoints || ""}
                </td>
                <td className="px-3 py-2 text-right text-red-400 tabular-nums">
                  {a.penaltyPoints ? `−${a.penaltyPoints}` : ""}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {a.incidents}
                </td>
                <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums">
                  {a.totalPoints}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamView({
  teams,
  isMulticlass,
  isMultiRace,
}: {
  teams: {
    teamName: string;
    drivers: Agg[];
    topNTotal: number;
    bestFinish: number | null;
  }[];
  isMulticlass: boolean;
  isMultiRace: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Team total = sum of the top {TEAM_BEST_N} drivers&apos; round totals
        {isMultiRace && " (race 1 + race 2 + bonus − penalty)"}.
        Click a team to expand its drivers.
      </p>
      {teams.map((team, i) => (
        <details
          key={team.teamName}
          className="overflow-hidden rounded border border-zinc-800"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 bg-zinc-900 px-3 py-2 hover:bg-zinc-800">
            <span className="w-8 text-right font-medium tabular-nums text-zinc-300">
              {i + 1}
            </span>
            <span className="flex-1 font-medium">{team.teamName}</span>
            <span className="text-xs text-zinc-500">
              {team.drivers.length}{" "}
              {team.drivers.length === 1 ? "driver" : "drivers"}
            </span>
            <span className="text-xs text-zinc-400">
              Best P{team.bestFinish ?? "—"}
            </span>
            <span className="font-semibold text-orange-400 tabular-nums">
              Top {TEAM_BEST_N}: {team.topNTotal} pts
            </span>
          </summary>
          <div className="overflow-x-auto">
          <table className="w-full text-sm freeze-driver-col">
            <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 driver-col">Driver</th>
                {isMulticlass && <th className="px-3 py-1.5">Class</th>}
                <th className="px-3 py-1.5 text-right">Inc</th>
                <th className="px-3 py-1.5 text-right">Race pts</th>
                <th className="px-3 py-1.5 text-right">Bonus</th>
                <th className="px-3 py-1.5 text-right">Pen</th>
                <th className="px-3 py-1.5 text-right">Total</th>
                <th className="px-3 py-1.5 text-right">In top {TEAM_BEST_N}</th>
              </tr>
            </thead>
            <tbody>
              {team.drivers.map((a, idx) => {
                const sample = a.rows[0];
                const inTopN = idx < TEAM_BEST_N;
                return (
                  <tr
                    key={a.registrationId}
                    className="border-t border-zinc-800"
                  >
                    <td
                      className={`px-3 py-1.5 driver-col ${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}
                    >
                      <CountryFlag code={sample.registration.user.countryCode} />
                      {sample.registration.user.firstName}{" "}
                      {sample.registration.user.lastName}
                      {sample.registration.excludedAt && (
                        <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                          Excluded
                        </span>
                      )}
                    </td>
                    {isMulticlass && (
                      <td className="px-3 py-1.5 text-zinc-400">
                        {sample.registration.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right text-zinc-400">
                      {a.incidents}
                    </td>
                    <td className="px-3 py-1.5 text-right text-zinc-300 tabular-nums">
                      {a.racePoints}
                    </td>
                    <td className="px-3 py-1.5 text-right text-emerald-400 tabular-nums">
                      {a.participationPoints || ""}
                    </td>
                    <td className="px-3 py-1.5 text-right text-red-400 tabular-nums">
                      {a.penaltyPoints ? `−${a.penaltyPoints}` : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-orange-400 tabular-nums">
                      {a.totalPoints}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {inTopN ? (
                        <span className="text-orange-400">✓</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </details>
      ))}
    </div>
  );
}

function QualifyingTable({
  rows,
  isMulticlass,
}: {
  rows: Agg[];
  isMulticlass: boolean;
}) {
  // For each driver, take the smallest non-null qualifyingTimeMs across
  // their RaceResult rows (in multi-race rounds R1 and R2 carry the same
  // value; for single-race it's just the one row).
  const drivers = rows
    .map((a) => {
      const sample = a.rows[0];
      let bestQuali: number | null = null;
      for (const r of a.rows) {
        if (
          r.qualifyingTimeMs != null &&
          (bestQuali == null || r.qualifyingTimeMs < bestQuali)
        ) {
          bestQuali = r.qualifyingTimeMs;
        }
      }
      return {
        registrationId: a.registrationId,
        firstName: sample.registration.user.firstName,
        lastName: sample.registration.user.lastName,
        countryCode: sample.registration.user.countryCode ?? null,
        startNumber: sample.registration.startNumber,
        teamName: sample.registration.team?.name ?? null,
        carClassName: sample.registration.carClass?.name ?? null,
        qualifyingTimeMs: bestQuali,
        excludedAt: sample.registration.excludedAt,
      };
    })
    .sort((a, b) => {
      const at = a.qualifyingTimeMs ?? Number.POSITIVE_INFINITY;
      const bt = b.qualifyingTimeMs ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });

  if (drivers.length === 0) {
    return null;
  }
  const pole = drivers[0]?.qualifyingTimeMs ?? null;

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="w-full text-sm freeze-driver-col">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2 driver-col">Driver</th>
            <th className="px-3 py-2">Team</th>
            {isMulticlass && <th className="px-3 py-2">Class</th>}
            <th className="px-3 py-2 text-right">Quali time</th>
            <th className="px-3 py-2 text-right">Gap to pole</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => {
            const gap =
              pole != null && d.qualifyingTimeMs != null
                ? d.qualifyingTimeMs - pole
                : null;
            return (
              <tr
                key={d.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">
                  {d.qualifyingTimeMs != null ? i + 1 : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {d.startNumber ?? "—"}
                </td>
                <td
                  className={`px-3 py-2 driver-col ${d.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}
                >
                  <CountryFlag code={d.countryCode} />
                  {d.firstName} {d.lastName}
                  {d.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {d.teamName ?? "—"}
                </td>
                {isMulticlass && (
                  <td className="px-3 py-2 text-zinc-400">
                    {d.carClassName ?? "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                  {formatMsToTime(d.qualifyingTimeMs) || "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">
                  {gap != null && gap > 0
                    ? "+" + formatMsToTime(gap)
                    : gap === 0
                      ? "pole"
                      : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function ReportButton({
  href,
  window: w,
}: {
  href: string;
  window: ReturnType<typeof protestWindowState>;
}) {
  if (w.status === "COOLDOWN" && w.minutesUntilOpen != null) {
    return (
      <span
        title={w.opensAt ? `Window opens at ${w.opensAt.toLocaleString()}` : "Cool-down"}
        className="cursor-not-allowed rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-400"
      >
        Reporting opens in {formatCountdown(w.minutesUntilOpen)}
      </span>
    );
  }
  if (w.status === "CLOSED") {
    return (
      <span
        title={w.closesAt ? `Window closed at ${w.closesAt.toLocaleString()}` : "Closed"}
        className="cursor-not-allowed rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-500"
      >
        Reporting closed
      </span>
    );
  }
  if (w.status === "OPEN" && w.minutesRemaining != null) {
    return (
      <a
        href={href}
        className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
      >
        ⚑ Report incident
        <span className="ml-1 text-xs text-orange-300/80">
          · closes in {formatCountdown(w.minutesRemaining)}
        </span>
      </a>
    );
  }
  return (
    <a
      href={href}
      className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
    >
      ⚑ Report incident
    </a>
  );
}


interface ByCarRow {
  registrationId: string;
  raceNumber: number;
  finishPosition: number;
  finishStatus: string;
  rawPointsAwarded: number;
  participationPointsAwarded: number;
  manualPenaltyPoints: number;
  carId: string | null;
  carName: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  startNumber: number | null;
}

function ByCarSection({
  allRows,
  isMultiRace,
  includeParticipation = true,
}: {
  allRows: ByCarRow[];
  isMultiRace: boolean;
  /** Mirrors ScoringSystem.participationInCombined. */
  includeParticipation?: boolean;
}) {
  // Group results by carId. Drivers without a carId go into "Unassigned".
  const byCar = new Map<string, { carName: string; rows: ByCarRow[] }>();
  for (const r of allRows) {
    const key = r.carId ?? "__none__";
    const name = r.carName ?? "Unassigned";
    if (!byCar.has(key)) byCar.set(key, { carName: name, rows: [] });
    byCar.get(key)!.rows.push(r);
  }
  // Order cars alphabetically; "Unassigned" last.
  const carEntries = [...byCar.entries()].sort(([ak, av], [bk, bv]) => {
    if (ak === "__none__") return 1;
    if (bk === "__none__") return -1;
    return av.carName.localeCompare(bv.carName);
  });

  if (carEntries.length === 0) {
    return (
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        No car-tagged results yet for this round. Re-import via iRacing JSON to
        populate cars.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {carEntries.map(([key, { carName, rows }]) => {
        // For each driver-in-this-car, show their finish in each race number.
        const byDriver = new Map<string, ByCarRow[]>();
        for (const r of rows) {
          const list = byDriver.get(r.registrationId) ?? [];
          list.push(r);
          byDriver.set(r.registrationId, list);
        }
        // Pick the BEST finish across races for sorting.
        const drivers = [...byDriver.entries()]
          .map(([regId, rs]) => {
            const best = Math.min(...rs.map((r) => r.finishPosition));
            const points = rs.reduce(
              (sum, r) =>
                sum +
                r.rawPointsAwarded +
                (includeParticipation ? r.participationPointsAwarded : 0) -
                r.manualPenaltyPoints,
              0
            );
            const head = rs[0];
            return { regId, rs, best, points, head };
          })
          .sort((a, b) => b.points - a.points || a.best - b.best);

        return (
          <details
            key={key}
            open
            className="rounded border border-zinc-800 bg-zinc-900/50"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
              <span className="font-display text-base font-semibold">
                {carName}
              </span>
              <span className="text-xs text-zinc-500">
                {drivers.length} driver{drivers.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-zinc-800">
              <table className="w-full text-sm freeze-driver-col">
                <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 w-10">Pos</th>
                    <th className="px-3 py-2 driver-col">Driver</th>
                    {isMultiRace ? (
                      <>
                        <th className="px-3 py-2 text-center">R1</th>
                        <th className="px-3 py-2 text-center">R2</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-center">Finish</th>
                    )}
                    <th className="px-3 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d, i) => {
                    const r1 = d.rs.find((r) => r.raceNumber === 1);
                    const r2 = d.rs.find((r) => r.raceNumber === 2);
                    const fmt = (r: ByCarRow | undefined) =>
                      !r
                        ? "—"
                        : r.finishStatus !== "CLASSIFIED"
                          ? r.finishStatus
                          : "P" + r.finishPosition;
                    return (
                      <tr
                        key={d.regId}
                        className="border-t border-zinc-800"
                      >
                        <td className="px-3 py-2 font-medium">{i + 1}</td>
                        <td className="px-3 py-2 driver-col">
                          <span className="inline-flex items-center gap-2">
                            {d.head.startNumber != null && (
                              <span className="text-xs text-zinc-500">
                                #{d.head.startNumber}
                              </span>
                            )}
                            <span>
                              {d.head.driverFirstName} {d.head.driverLastName}
                            </span>
                          </span>
                        </td>
                        {isMultiRace ? (
                          <>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {fmt(r1)}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {fmt(r2)}
                            </td>
                          </>
                        ) : (
                          <td className="px-3 py-2 text-center text-zinc-300">
                            {fmt(r1 ?? r2)}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {d.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </section>
  );
}


interface RoundTeamRow {
  id: string;
  teamId: string;
  finishPosition: number;
  classPosition: number | null;
  lapsCompleted: number;
  raceDistancePct: number;
  totalIncidents: number;
  finishStatus: string;
  totalTimeMs: number | null;
  bestLapTimeMs: number | null;
  rawPointsAwarded: number;
  participationPointsAwarded: number;
  correctionPoints: number;
  manualPenaltyPoints: number;
  team: { id: string; name: string };
  carClass: { id: string; name: string; shortCode: string; displayOrder: number } | null;
  participations: Array<{
    id: string;
    lapsCompleted: number;
    lapsLed: number;
    incidents: number;
    iRating: number | null;
    finishStatus: string;
    registration: {
      id: string;
      user: {
        firstName: string | null;
        lastName: string | null;
        countryCode: string | null;
      };
    };
  }>;
}

function flagFor(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const cps = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...cps);
}

function RoundTeamSection({ teamResults }: { teamResults: RoundTeamRow[] }) {
  // Group by carClassId
  const byClass = new Map<string, { name: string; short: string; order: number; rows: RoundTeamRow[] }>();
  for (const r of teamResults) {
    const cid = r.carClass?.id ?? "__none__";
    if (!byClass.has(cid)) {
      byClass.set(cid, {
        name: r.carClass?.name ?? "Unassigned",
        short: r.carClass?.shortCode ?? "—",
        order: r.carClass?.displayOrder ?? 999,
        rows: [],
      });
    }
    byClass.get(cid)!.rows.push(r);
  }
  const groups = [...byClass.entries()].sort(([, a], [, b]) => a.order - b.order || a.name.localeCompare(b.name));

  return (
    <section className="space-y-4">
      {groups.map(([cid, g]) => (
        <details
          key={cid}
          open
          className="rounded border border-zinc-800 bg-zinc-900/50"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
            <span className="flex items-center gap-3">
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {g.short}
              </span>
              <span className="font-display text-base font-semibold">{g.name}</span>
              <span className="text-xs text-zinc-500">
                ({g.rows.length} team{g.rows.length === 1 ? "" : "s"})
              </span>
            </span>
          </summary>
          <div className="divide-y divide-zinc-800 border-t border-zinc-800">
            {g.rows.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-200">
                      {r.classPosition != null ? "P" + r.classPosition : "—"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Overall P{r.finishPosition}
                    </span>
                    <span className="font-display text-base font-semibold">{r.team.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-400">{r.lapsCompleted} laps</span>
                    <span className="text-zinc-400">{r.totalIncidents} inc</span>
                    {r.finishStatus !== "CLASSIFIED" && (
                      <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                        {r.finishStatus}
                      </span>
                    )}
                  </div>
                </div>
                {r.participations.length > 0 && (
                  <div className="mt-2 ml-1 grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                    {r.participations.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{flagFor(d.registration.user.countryCode)}</span>
                        <span className="text-zinc-200">
                          {d.registration.user.firstName} {d.registration.user.lastName}
                        </span>
                        <span className="ml-auto text-zinc-500">
                          {d.lapsCompleted}L · {d.incidents}x
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

/**
 * Build a flat per-team summary row for the team-event tables. Aggregates
 * team data with per-driver lookups via participations → RaceResult.
 */
type TeamRowSummary = {
  teamId: string;
  teamName: string;
  classPosition: number | null;
  finishPosition: number;
  finishStatus: string;
  lapsCompleted: number;
  totalTimeMs: number | null;
  bestLapTimeMs: number | null;
  bestQualiMs: number | null;
  totalLapsLed: number;
  totalIncidents: number;
  racePts: number;
  bonusPts: number;
  penPts: number;
  totalPts: number;
};

interface ScoringFlags {
  participationPoints: number;
  participationMinDistancePct: number;
  racePointsMinDistancePct: number;
  driverFprEnabled: boolean;
  driverFprTiers: ReturnType<typeof readDriverFprTiers>;
  driverFprMinDistancePct: number;
}

function buildTeamRowSummary(
  tr: RoundTeamRow,
  raceResultByRegId: Map<
    string,
    { qualifyingTimeMs: number | null; bestLapTimeMs: number | null }
  >,
  fprByTeamAndClass: Map<string, number>,
  selectedClassId: string,
  pointsTable: Record<string, number>,
  scoring: ScoringFlags,
  classMaxLaps: number
): TeamRowSummary {
  let bestQualiMs: number | null = null;
  let bestLapTimeMs: number | null = tr.bestLapTimeMs ?? null;
  let totalLapsLed = 0;
  for (const p of tr.participations) {
    totalLapsLed += p.lapsLed;
    const rr = raceResultByRegId.get(p.registration.id);
    if (rr) {
      if (
        rr.qualifyingTimeMs != null &&
        (bestQualiMs == null || rr.qualifyingTimeMs < bestQualiMs)
      ) {
        bestQualiMs = rr.qualifyingTimeMs;
      }
      if (
        rr.bestLapTimeMs != null &&
        (bestLapTimeMs == null || rr.bestLapTimeMs < bestLapTimeMs)
      ) {
        bestLapTimeMs = rr.bestLapTimeMs;
      }
    }
  }
  // Mirror computeTeamClassStandings in src/lib/standings.ts:
  //   Race pts: rawPointsAwarded if set, else pointsTable[classPosition],
  //             gated by raceDistancePct >= racePointsMinDistancePct
  //   Participation: stored value, else participationPoints when raceDistancePct
  //                  >= participationMinDistancePct
  //   FPR:          driver-FPR tier when enabled AND raceDistancePct meets
  //                  driverFprMinDistancePct, indexed by totalIncidents
  //   DSQ teams forfeit race + participation + FPR for the round.
  //   Bonus Pts column = participation + FPR (+ any legacy FPRAward row)
  //
  // The distance check is CLASS-relative (lapsCompleted / class-leader laps)
  // so slower classes aren't penalised. In multi-class IEC, GT4 leader laps
  // are well below LMP2 leader laps; if we used the session-wide
  // raceDistancePct (which is overall-relative), every GT4 team would fail
  // the 90% gate.
  const classDistancePct =
    classMaxLaps > 0
      ? Math.min(100, Math.floor((tr.lapsCompleted / classMaxLaps) * 100))
      : tr.raceDistancePct ?? 0;
  const isDsq = tr.finishStatus === "DSQ";
  const meetsRaceDistance =
    !isDsq && classDistancePct >= scoring.racePointsMinDistancePct;
  const basePts =
    meetsRaceDistance && tr.classPosition != null
      ? pointsTable[String(tr.classPosition)] ?? 0
      : 0;
  const racePts = meetsRaceDistance
    ? tr.rawPointsAwarded > 0
      ? tr.rawPointsAwarded
      : basePts
    : 0;

  const participationStored = tr.participationPointsAwarded ?? 0;
  let participationPts = participationStored;
  if (
    !isDsq &&
    participationPts === 0 &&
    classDistancePct >= scoring.participationMinDistancePct
  ) {
    participationPts = scoring.participationPoints;
  }
  if (isDsq) participationPts = 0;

  let fprPts = 0;
  if (
    !isDsq &&
    scoring.driverFprEnabled &&
    classDistancePct >= scoring.driverFprMinDistancePct
  ) {
    fprPts = fprPointsForIncidents(
      tr.totalIncidents ?? 0,
      scoring.driverFprTiers
    );
  }
  // Plus any legacy FPRAward row stored on this round (rare on IEC but
  // kept for backwards compatibility). Suppress for DSQ.
  const legacyFpr = isDsq
    ? 0
    : fprByTeamAndClass.get(`${tr.teamId}::${selectedClassId}`) ?? 0;

  const bonusPts = participationPts + fprPts + legacyFpr;
  const penPts = tr.manualPenaltyPoints;
  // Total = Race + Bonus (penalty is shown separately).
  const totalPts = racePts + bonusPts;
  return {
    teamId: tr.teamId,
    teamName: tr.team.name,
    classPosition: tr.classPosition,
    finishPosition: tr.finishPosition,
    finishStatus: tr.finishStatus,
    lapsCompleted: tr.lapsCompleted,
    totalTimeMs: tr.totalTimeMs,
    bestLapTimeMs,
    bestQualiMs,
    totalLapsLed,
    totalIncidents: tr.totalIncidents ?? 0,
    racePts,
    bonusPts,
    penPts,
    totalPts,
  };
}

function formatGapMs(gapMs: number | null): string {
  if (gapMs == null) return "—";
  if (gapMs === 0) return "—";
  return "+" + formatMsToTime(gapMs);
}

// Header cells reused by both race and quali tables.
function TeamTableHead() {
  return (
    <thead className="bg-zinc-900 text-left text-zinc-400">
      <tr>
        <th className="px-3 py-2">Pos.</th>
        <th className="px-3 py-2 driver-col">Team</th>
        <th className="px-3 py-2 text-right">Qualy Lap</th>
        <th className="px-3 py-2 text-right">Fastest Lap</th>
        <th className="px-3 py-2 text-right">Avg. Lap</th>
        <th className="px-3 py-2 text-right">Interval</th>
        <th className="px-3 py-2 text-right">Laps Lead</th>
        <th className="px-3 py-2 text-right">Laps Compl.</th>
        <th className="px-3 py-2 text-right">Inc.</th>
        <th className="px-3 py-2 text-right">Race Pts.</th>
        <th className="px-3 py-2 text-right">Bonus Pts.</th>
        <th className="px-3 py-2 text-right">Pen.</th>
        <th className="px-3 py-2 text-right">Total</th>
      </tr>
    </thead>
  );
}

function TeamRowCells({
  s,
  pos,
  leader,
  intervalKind, // "race" => gap to leader by laps/time; "quali" => gap to pole quali time
}: {
  s: TeamRowSummary;
  pos: number;
  leader: TeamRowSummary;
  intervalKind: "race" | "quali";
}) {
  // Avg lap from totalTimeMs / lapsCompleted
  const avgLapMs =
    s.totalTimeMs != null && s.lapsCompleted > 0
      ? Math.round(s.totalTimeMs / s.lapsCompleted)
      : null;

  // Race interval: if same lap count, time delta; otherwise laps behind.
  // Quali interval: gap in best quali time.
  let intervalCell: string;
  if (intervalKind === "quali") {
    intervalCell =
      s.bestQualiMs != null && leader.bestQualiMs != null
        ? s === leader
          ? "—"
          : "+" + formatMsToTime(s.bestQualiMs - leader.bestQualiMs)
        : "—";
  } else {
    if (s === leader) intervalCell = "—";
    else if (s.lapsCompleted < leader.lapsCompleted) {
      intervalCell = `+${leader.lapsCompleted - s.lapsCompleted} Lap${leader.lapsCompleted - s.lapsCompleted === 1 ? "" : "s"}`;
    } else if (
      s.totalTimeMs != null &&
      leader.totalTimeMs != null
    ) {
      intervalCell = "+" + formatMsToTime(s.totalTimeMs - leader.totalTimeMs);
    } else {
      intervalCell = "—";
    }
  }

  return (
    <>
      <td className="px-3 py-2 font-medium tabular-nums">{pos}.</td>
      <td className="px-3 py-2 font-medium driver-col">
        {s.teamName}
        {s.finishStatus !== "CLASSIFIED" && (
          <span className="ml-2 rounded bg-red-900/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-red-200">
            {s.finishStatus}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
        {formatMsToTime(s.bestQualiMs) || "—"}
      </td>
      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
        {formatMsToTime(s.bestLapTimeMs) || "—"}
      </td>
      <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
        {formatMsToTime(avgLapMs) || "—"}
      </td>
      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
        {intervalCell}
      </td>
      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
        {s.totalLapsLed}
      </td>
      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
        {s.lapsCompleted}
      </td>
      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
        {s.totalIncidents}
      </td>
      <td className="px-3 py-2 text-right text-zinc-200 tabular-nums">
        {s.racePts}
      </td>
      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
        {s.bonusPts || ""}
      </td>
      <td className="px-3 py-2 text-right text-red-400 tabular-nums">
        {s.penPts > 0 ? `−${s.penPts} pts.` : ""}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-orange-400 tabular-nums">
        {s.totalPts}
      </td>
    </>
  );
}

/**
 * Race results table for a single class: one row per team, sorted by
 * classPosition (DNFs/DSQ last by finishPosition).
 */
function RoundTeamRaceTable({
  teamResults,
  raceResultByRegId,
  fprByTeamAndClass,
  selectedClassId,
  pointsTable,
  scoring,
}: {
  teamResults: RoundTeamRow[];
  raceResultByRegId: Map<
    string,
    { qualifyingTimeMs: number | null; bestLapTimeMs: number | null }
  >;
  fprByTeamAndClass: Map<string, number>;
  selectedClassId: string;
  pointsTable: Record<string, number>;
  scoring: ScoringFlags;
}) {
  if (teamResults.length === 0) {
    return (
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        No team results for this class.
      </p>
    );
  }
  // Class-relative distance: 100% means the team finished at the class
  // leader's lap count, regardless of how slow the class is overall.
  const classMaxLaps = teamResults.reduce(
    (m, tr) => Math.max(m, tr.lapsCompleted ?? 0),
    0
  );
  const summaries = teamResults.map((tr) =>
    buildTeamRowSummary(tr, raceResultByRegId, fprByTeamAndClass, selectedClassId, pointsTable, scoring, classMaxLaps)
  );
  const sorted = [...summaries].sort((a, b) => {
    // Classified first by classPosition, then DNF/DSQ by finishPosition
    const aClassPos = a.classPosition ?? 9999;
    const bClassPos = b.classPosition ?? 9999;
    return aClassPos - bClassPos || a.finishPosition - b.finishPosition;
  });
  const leader = sorted[0];
  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm freeze-driver-col">
        <TeamTableHead />
        <tbody>
          {sorted.map((s, i) => (
            <tr
              key={s.teamId}
              className="border-t border-zinc-800 hover:bg-zinc-900"
            >
              <TeamRowCells s={s} pos={i + 1} leader={leader} intervalKind="race" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Qualifying table for a single class: only quali-relevant columns
 * (Pos, Team, Qualy Lap, Interval). Race-session columns are intentionally
 * omitted — qualifying doesn't generate race points, bonus points, or
 * penalties.
 */
function RoundTeamQualiTable({
  teamResults,
  raceResultByRegId,
  fprByTeamAndClass,
  selectedClassId,
  pointsTable,
  scoring,
}: {
  teamResults: RoundTeamRow[];
  raceResultByRegId: Map<
    string,
    { qualifyingTimeMs: number | null; bestLapTimeMs: number | null }
  >;
  fprByTeamAndClass: Map<string, number>;
  selectedClassId: string;
  pointsTable: Record<string, number>;
  scoring: ScoringFlags;
}) {
  if (teamResults.length === 0) {
    return (
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        No qualifying data available for this class.
      </p>
    );
  }
  // We still reuse buildTeamRowSummary to harvest bestQualiMs and teamName
  // per team — race-side fields it produces are simply not rendered here.
  const classMaxLaps = teamResults.reduce(
    (m, tr) => Math.max(m, tr.lapsCompleted ?? 0),
    0
  );
  const summaries = teamResults.map((tr) =>
    buildTeamRowSummary(tr, raceResultByRegId, fprByTeamAndClass, selectedClassId, pointsTable, scoring, classMaxLaps)
  );
  const sorted = [...summaries].sort((a, b) => {
    const at = a.bestQualiMs ?? Number.POSITIVE_INFINITY;
    const bt = b.bestQualiMs ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return (a.classPosition ?? 9999) - (b.classPosition ?? 9999);
  });
  const anyQuali = sorted.some((s) => s.bestQualiMs != null);
  if (!anyQuali) {
    return (
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        No qualifying times recorded for this class — the import may have come from a results-only source, or the qualifying session was not captured.
      </p>
    );
  }
  const pole = sorted[0]?.bestQualiMs ?? null;

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-sm freeze-driver-col">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos.</th>
            <th className="px-3 py-2 driver-col">Team</th>
            <th className="px-3 py-2 text-right">Qualy Lap</th>
            <th className="px-3 py-2 text-right">Interval</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const gapToPole =
              pole != null && s.bestQualiMs != null
                ? s.bestQualiMs - pole
                : null;
            return (
              <tr
                key={s.teamId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium tabular-nums">
                  {s.bestQualiMs != null ? `${i + 1}.` : "—"}
                </td>
                <td className="px-3 py-2 font-medium driver-col">{s.teamName}</td>
                <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                  {formatMsToTime(s.bestQualiMs) || "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {gapToPole == null
                    ? "—"
                    : gapToPole === 0
                      ? "pole"
                      : "+" + formatMsToTime(gapToPole)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// formatGapMs is reserved for future per-cell gap formatting helpers.
void formatGapMs;
