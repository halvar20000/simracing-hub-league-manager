import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { computeDriverStandings } from "@/lib/standings";
import { EmptyState, CalendarIcon, UsersIcon } from "@/components/EmptyState";
import { SeasonHero } from "@/components/SeasonHero";
import { CountryFlag } from "@/components/CountryFlag";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) {
    return { title: "Season not found" };
  }
  const title = `${season.league.name} — ${season.name} ${season.year}`;
  const description = season.scheduleImageUrl
    ? `Race calendar, standings, and results for ${season.name} ${season.year}.`
    : `Standings and results for ${season.name} ${season.year}.`;
  const image = season.scheduleImageUrl ?? season.league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PublicSeasonDetail({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      scoringSystem: true,
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { _count: { select: { raceResults: true } } },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: { user: true, team: true, carClass: true },
        orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!season || season.league.slug !== slug) notFound();

  const registrationOpen =
    season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE";
  const hasResults = season.rounds.some((r) => r._count.raceResults > 0);
  const completedRounds = season.rounds.filter((r) => r.status === "COMPLETED").length;
  const totalRounds = season.rounds.length;

  // Next round = first round whose startsAt is in the future, or first
  // non-completed round if all are in the past
  const now = Date.now();
  const futureRounds = [...season.rounds]
    .filter((r) => r.startsAt.getTime() > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const nextRound = futureRounds[0] ?? null;

  // Current leader = top of computeDriverStandings, if any results exist
  let currentLeader: {
    firstName: string | null;
    lastName: string | null;
    startNumber: number | null;
    teamName: string | null;
    points: number;
  } | null = null;
  if (hasResults) {
    try {
      const standings = await computeDriverStandings(prisma, seasonId);
      const top = standings[0];
      if (top) {
        currentLeader = {
          firstName: top.driverFirstName,
          lastName: top.driverLastName,
          startNumber: top.startNumber,
          teamName: top.teamName,
          points: top.combinedTotal,
        };
      }
    } catch {
      currentLeader = null;
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/leagues/${slug}`}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← {season.league.name}
      </Link>

      <SeasonHero
        slug={slug}
        seasonId={seasonId}
        leagueLogoUrl={season.league.logoUrl}
        leagueName={season.league.name}
        seasonName={season.name}
        seasonYear={season.year}
        scoringSystemName={season.scoringSystem.name}
        status={season.status}
        isMulticlass={season.isMulticlass}
        proAmEnabled={season.proAmEnabled}
        scheduleImageUrl={season.scheduleImageUrl}
        totalRounds={totalRounds}
        completedRounds={completedRounds}
        currentLeader={currentLeader}
        nextRound={
          nextRound
            ? {
                name: nextRound.name,
                track: nextRound.track,
                trackConfig: nextRound.trackConfig,
                startsAtIso: nextRound.startsAt.toISOString(),
              }
            : null
        }
        registrationOpen={registrationOpen}
        hasResults={hasResults}
      />

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Race calendar
        </h2>
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-display tracking-wider">Rd</th>
                <th className="px-3 py-2 font-display tracking-wider">Name</th>
                <th className="px-3 py-2 font-display tracking-wider">Track</th>
                <th className="px-3 py-2 font-display tracking-wider">Date</th>
                <th className="px-3 py-2 font-display tracking-wider">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-display text-zinc-500">
                    {r.roundNumber}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                      className="hover:text-[#ff6b35]"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {formatDateTime(r.startsAt)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {r._count.raceResults > 0 ? (
                      <Link
                        href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-[#ff6b35] hover:underline"
                      >
                        Results →
                      </Link>
                    ) : (
                      <span className="text-xs">No results</span>
                    )}
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={<CalendarIcon />}
                      title="No rounds scheduled yet"
                      description="Rounds will appear once the schedule is published."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <EmptyState
            icon={<UsersIcon />}
            title="No approved drivers yet"
            description="Drivers who register and are approved will show up here."
          />
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-display tracking-wider">#</th>
                  <th className="px-3 py-2 font-display tracking-wider">Driver</th>
                  <th className="px-3 py-2 font-display tracking-wider">Team</th>
                  {season.isMulticlass && (
                    <th className="px-3 py-2 font-display tracking-wider">Class</th>
                  )}
                  {season.proAmEnabled && (
                    <th className="px-3 py-2 font-display tracking-wider">Pro/Am</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {season.registrations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-display text-zinc-500">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <CountryFlag code={r.user.countryCode} />
                      {r.user.firstName} {r.user.lastName}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.team?.name ?? "—"}
                    </td>
                    {season.isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {season.proAmEnabled && (
                      <td className="px-3 py-2 text-zinc-400">
                        {r.proAmClass ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
