import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeDriverStandings, computeTeamClassStandings } from "@/lib/standings";
import { CountryFlag } from "@/components/CountryFlag";
import { NextRaceHero } from "@/components/NextRaceHero";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) return { title: "League not found" };
  const title = league.name;
  const description = league.description ?? `Standings, schedules, and results for ${league.name}.`;
  const image = league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PublicLeagueDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await prisma.league.findUnique({
    where: { slug },
    include: {
      seasons: {
        orderBy: [{ year: "desc" }, { name: "asc" }],
        include: {
          scoringSystem: { select: { name: true } },
          _count: { select: { rounds: true, registrations: true } },
          rounds: {
            orderBy: { startsAt: "asc" },
            select: {
              id: true,
              name: true,
              track: true,
              trackConfig: true,
              startsAt: true,
              status: true,
              roundNumber: true,
              _count: { select: { raceResults: true } },
            },
          },
        },
      },
    },
  });
  if (!league) notFound();

  const now = Date.now();

  // Stats
  const totalSeasons = league.seasons.length;
  const totalRegistrations = league.seasons.reduce(
    (sum, s) => sum + s._count.registrations,
    0
  );
  const totalRounds = league.seasons.reduce(
    (sum, s) => sum + s._count.rounds,
    0
  );
  const totalResults = await prisma.raceResult.count({
    where: { round: { season: { leagueId: league.id } } },
  });

  // Active season: ACTIVE or OPEN_REGISTRATION; fall back to most recent
  const activeSeason =
    league.seasons.find(
      (s) => s.status === "ACTIVE" || s.status === "OPEN_REGISTRATION"
    ) ?? league.seasons[0];
  let activeNextRound: typeof activeSeason.rounds[number] | null = null;
  let activeLeader: {
    firstName: string | null;
    lastName: string | null;
    countryCode: string | null;
    points: number;
  } | null = null;
  if (activeSeason) {
    activeNextRound =
      activeSeason.rounds.find((r) => r.startsAt.getTime() > now) ?? null;
    const hasResults = activeSeason.rounds.some(
      (r) => r._count.raceResults > 0
    );
    if (hasResults) {
      try {
        const standings = await computeDriverStandings(prisma, activeSeason.id);
        const top = standings[0];
        if (top) {
          activeLeader = {
            firstName: top.driverFirstName,
            lastName: top.driverLastName,
            countryCode: top.countryCode,
            points: top.combinedTotal,
          };
        }
      } catch {
        activeLeader = null;
      }
    }
  }

  const activeTeamClasses = activeSeason
    ? await computeTeamClassStandings(prisma, activeSeason.id)
    : [];
  const activeIsTeamEvent = activeTeamClasses.length > 0;
  const activeClassLeaders = activeTeamClasses
    .map((g) => {
      const top = g.teams[0];
      return top
        ? { shortCode: g.carClassShortCode, className: g.carClassName, teamName: top.teamName, points: top.totalPoints }
        : null;
    })
    .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null);

  // Latest results across all this league's seasons
  const recentRounds = await prisma.round.findMany({
    where: {
      season: { leagueId: league.id },
      status: "COMPLETED",
      raceResults: { some: {} },
    },
    orderBy: { startsAt: "desc" },
    take: 3,
    include: {
      season: { select: { id: true, name: true, year: true } },
      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true },
          },
        },
      },
      teamResults: {
        include: {
          team: { select: { name: true } },
          carClass: { select: { shortCode: true, name: true, displayOrder: true } },
        },
        orderBy: [{ classPosition: "asc" }],
      },
    },
  });
  const recentPodiums = recentRounds.map((round) => {
    // Team-event round → class winners (top 1 per car class)
    if (round.teamResults && round.teamResults.length > 0) {
      const byClass = new Map<string, { className: string; shortCode: string; order: number; row: { teamName: string; classPosition: number | null } | null }>();
      for (const tr of round.teamResults) {
        const id = tr.carClass?.shortCode ?? "—";
        if (!byClass.has(id)) {
          byClass.set(id, {
            className: tr.carClass?.name ?? "Class",
            shortCode: tr.carClass?.shortCode ?? "—",
            order: tr.carClass?.displayOrder ?? 999,
            row: null,
          });
        }
        const slot = byClass.get(id)!;
        if ((tr.classPosition ?? 999) === 1) {
          slot.row = { teamName: tr.team.name, classPosition: tr.classPosition };
        }
      }
      const classWinners = [...byClass.values()]
        .filter((b) => b.row != null)
        .sort((a, b) => a.order - b.order)
        .map((b) => ({ shortCode: b.shortCode, teamName: b.row!.teamName }));
      return { round, isTeamEvent: true as const, classWinners, top3: [] as Array<{ registrationId: string; firstName: string | null; lastName: string | null; countryCode: string | null }> };
    }

    // Driver-event round → top 3 drivers (existing behavior)
    type Agg = {
      registrationId: string;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
      total: number;
      anyClassified: boolean;
    };
    const m = new Map<string, Agg>();
    for (const r of round.raceResults) {
      let a = m.get(r.registrationId);
      if (!a) {
        a = {
          registrationId: r.registrationId,
          firstName: r.registration.user.firstName,
          lastName: r.registration.user.lastName,
          countryCode: r.registration.user.countryCode,
          total: 0,
          anyClassified: false,
        };
        m.set(r.registrationId, a);
      }
      a.total +=
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints +
        (r.correctionPoints ?? 0);
      if (r.finishStatus === "CLASSIFIED") a.anyClassified = true;
    }
    const top3 = [...m.values()]
      .filter((a) => a.anyClassified)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    return { round, isTeamEvent: false as const, classWinners: [] as Array<{ shortCode: string; teamName: string }>, top3 };
  });

  // Past champions — for any season whose final round is in the past AND has
  // results, take the standings leader. Skip the active season (it's a
  // "current leader" not a champion).
  const completedSeasonsForHallOfFame = league.seasons.filter((s) => {
    if (activeSeason && s.id === activeSeason.id) return false;
    const lastRound = s.rounds[s.rounds.length - 1];
    if (!lastRound) return false;
    if (lastRound.startsAt.getTime() > now) return false;
    return s.rounds.some((r) => r._count.raceResults > 0);
  });
  const champions = await Promise.all(
    completedSeasonsForHallOfFame.map(async (s) => {
      try {
        const teamClasses = await computeTeamClassStandings(prisma, s.id);
        if (teamClasses.length > 0) {
          const classChampions = teamClasses
            .map((g) => {
              const top = g.teams[0];
              return top ? { shortCode: g.carClassShortCode, className: g.carClassName, teamName: top.teamName, points: top.totalPoints } : null;
            })
            .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null);
          return { season: s, champion: null as null, classChampions };
        }
        const standings = await computeDriverStandings(prisma, s.id);
        const top = standings[0];
        return { season: s, champion: top ?? null, classChampions: [] as Array<{ shortCode: string; className: string; teamName: string; points: number }> };
      } catch {
        return { season: s, champion: null as null, classChampions: [] as Array<{ shortCode: string; className: string; teamName: string; points: number }> };
      }
    })
  );
  const championedSeasons = champions.filter((c) => c.champion || (c.classChampions && c.classChampions.length > 0));

  return (
    <div className="space-y-4">
      <Link
        href="/leagues"
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← All leagues
      </Link>

      {/* Header */}
      <section className="flex items-center gap-3">
        {league.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={league.logoUrl}
            alt={league.name}
            className="h-12 w-12 shrink-0 object-contain"
          />
        )}
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {league.name}
          </h1>
          {league.description && (
            <p className="mt-0.5 text-xs text-zinc-400">{league.description}</p>
          )}
        </div>
      </section>

      {/* Stats banner */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Seasons" value={totalSeasons} />
        <Stat label="Drivers" value={totalRegistrations} />
        <Stat label="Rounds" value={totalRounds} />
        <Stat label="Race results" value={totalResults} />
      </section>

      {/* Active season — next-race banner if upcoming */}
      {activeSeason && activeNextRound && (
        <NextRaceHero
          leagueName={league.name}
          leagueLogoUrl={league.logoUrl}
          leagueSlug={league.slug}
          seasonId={activeSeason.id}
          roundId={activeNextRound.id}
          roundName={activeNextRound.name}
          trackName={activeNextRound.track}
          trackConfig={activeNextRound.trackConfig}
          startsAtIso={activeNextRound.startsAt.toISOString()}
        />
      )}

      {/* Active season class leaders (team event) */}
      {activeSeason && activeIsTeamEvent && activeClassLeaders.length > 0 && (
        <Link
          href={`/leagues/${league.slug}/seasons/${activeSeason.id}/standings`}
          className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Class leaders · {activeSeason.name} {activeSeason.year}
          </div>
          <ul className="mt-1.5 space-y-1">
            {activeClassLeaders.map((cl) => (
              <li key={cl.shortCode} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-baseline gap-1.5">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">{cl.shortCode}</span>
                  <span className="font-medium text-zinc-100">{cl.teamName}</span>
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{cl.points} pts</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-zinc-500">open standings →</div>
        </Link>
      )}

      {/* Active season driver leader card if no upcoming round (non-team events) */}
      {activeSeason && !activeIsTeamEvent && !activeNextRound && activeLeader && (
        <Link
          href={`/leagues/${league.slug}/seasons/${activeSeason.id}/standings`}
          className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Current leader · {activeSeason.name} {activeSeason.year}
          </div>
          <div className="mt-1 font-display text-lg font-bold text-zinc-100">
            <CountryFlag code={activeLeader.countryCode} />
            {activeLeader.firstName} {activeLeader.lastName}
          </div>
          <div className="text-xs text-zinc-400">
            {activeLeader.points} pts · open standings →
          </div>
        </Link>
      )}

      {/* Latest results strip */}
      {recentPodiums.length > 0 && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Latest results
          </h2>
          <div className="space-y-1.5">
            {recentPodiums.map((entry) => { const round = entry.round; const top3 = entry.top3; return (
              <Link
                key={round.id}
                href={`/leagues/${league.slug}/seasons/${round.season.id}/rounds/${round.id}`}
                className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-[#ff6b35]"
              >
                <span className="text-zinc-500">
                  {round.season.name} {round.season.year} · R{round.roundNumber}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="font-medium text-zinc-200">{round.track}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  {(round as any).isTeamEvent
                    ? (round as any).classWinners?.map((cw: { shortCode: string; teamName: string }) => (
                        <span key={cw.shortCode} className="flex items-center gap-1">
                          <span className="rounded bg-zinc-800 px-1 py-0 text-[9px] font-bold tracking-wider text-zinc-300">
                            {cw.shortCode}
                          </span>
                          <span className="text-zinc-200">{cw.teamName}</span>
                        </span>
                      ))
                    : top3.map((d, i) => (
                        <span
                          key={d.registrationId}
                          className="flex items-center gap-1"
                        >
                          <span className="text-zinc-500">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                          </span>
                          <CountryFlag
                            code={d.countryCode}
                            className="text-[12px] leading-none"
                          />
                          <span className="text-zinc-200">
                            {d.firstName} {d.lastName}
                          </span>
                        </span>
                      ))}
                </span>
              </Link>
            ); })}
          </div>
        </section>
      )}

      {/* Seasons grid */}
      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Seasons
        </h2>
        <div className="grid gap-2 md:grid-cols-2">
          {league.seasons.map((s) => (
            <Link
              key={s.id}
              href={`/leagues/${league.slug}/seasons/${s.id}`}
              className="block rounded border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold tracking-wide">
                  {s.name} {s.year}
                </h3>
                <span className="tag tag-zinc">
                  {s.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {s.scoringSystem.name} · {s._count.rounds} round
                {s._count.rounds === 1 ? "" : "s"} · {s._count.registrations}{" "}
                driver{s._count.registrations === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
          {league.seasons.length === 0 && (
            <p className="text-zinc-500">No seasons yet.</p>
          )}
        </div>
      </section>

      {/* Hall of Fame */}
      {championedSeasons.length > 0 && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Hall of Fame
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {championedSeasons.map((entry) => (
              <Link
                key={entry.season.id}
                href={`/leagues/${league.slug}/seasons/${entry.season.id}/standings`}
                className="block rounded-lg border border-yellow-700/30 bg-gradient-to-br from-yellow-950/30 via-zinc-900 to-zinc-950 p-3 transition-colors hover:border-yellow-500/60"
              >
                <div className="text-[9px] font-semibold uppercase tracking-widest text-yellow-300/80">
                  {entry.classChampions && entry.classChampions.length > 0 ? "Class champions" : "Champion"} · {entry.season.name} {entry.season.year}
                </div>
                {entry.classChampions && entry.classChampions.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {entry.classChampions.map((cc) => (
                      <li key={cc.shortCode} className="flex items-baseline justify-between gap-2">
                        <span className="flex items-baseline gap-1.5">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">{cc.shortCode}</span>
                          <span className="font-medium text-zinc-100">{cc.teamName}</span>
                        </span>
                        <span className="text-xs text-zinc-400 tabular-nums">{cc.points} pts</span>
                      </li>
                    ))}
                  </ul>
                ) : entry.champion ? (
                  <>
                    <div className="mt-1 font-display text-base font-bold text-zinc-100">
                      <CountryFlag code={entry.champion.countryCode} />
                      {entry.champion.driverFirstName} {entry.champion.driverLastName}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {entry.champion.combinedTotal} pts
                      {entry.champion.teamName ? ` · ${entry.champion.teamName}` : ""}
                    </div>
                  </>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="font-display text-xl font-bold text-zinc-100 tabular-nums">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
    </div>
  );
}
