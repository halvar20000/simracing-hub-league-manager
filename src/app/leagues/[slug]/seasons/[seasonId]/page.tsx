import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { computeDriverStandings, computeTeamClassStandings } from "@/lib/standings";
import { EmptyState, CalendarIcon, UsersIcon } from "@/components/EmptyState";
import { SeasonHero } from "@/components/SeasonHero";
import { CountryFlag } from "@/components/CountryFlag";
import { ProAmBadge } from "@/components/ProAmBadge";
import { SortableGroupedTableEnhancer } from "@/components/SortableGroupedTableEnhancer";
import Garage61Link from "@/components/Garage61Link";
import { compareStartNumber } from "@/lib/start-number";
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
        // Schedule display: order by calendar date so a postponed / make-up
        // round (e.g. a "Nachholtermin") shows in its real chronological slot,
        // not by its round number. roundNumber is the tiebreak. Scoring and
        // standings keep round-number order elsewhere.
        orderBy: [{ startsAt: "asc" }, { roundNumber: "asc" }],
        include: { _count: { select: { raceResults: true } } },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: { user: true, team: true, carClass: true, car: true },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });
  if (!season || season.league.slug !== slug) notFound();

  // Numeric-aware ordering by start number (text field, leading zeros allowed)
  season.registrations.sort((a, b) =>
    compareStartNumber(a.startNumber, b.startNumber)
  );

  // Split confirmed grid drivers from the waiting list (capped seasons only).
  // Waitlisted = APPROVED but over the season's maxDrivers cap; show them in a
  // separate list, in registration order (first registered is next in line).
  const confirmedRegs = season.registrations.filter(
    (r) => r.waitlistedAt == null
  );
  const waitlistRegs = season.registrations
    .filter((r) => r.waitlistedAt != null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const fmtWaitDate = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // Team-registration seasons (IEC): group the roster so the TEAM is the
  // primary row and its drivers sit underneath. Non-driving team managers
  // (isTeamManager) are excluded from the driver rows. Teams are ordered by
  // creation (registration order); drivers keep their registration order.
  type RegWithRels = (typeof season.registrations)[number];
  const teamRoster: {
    team: { id: string; name: string; leaderUserId: string | null } | null;
    drivers: RegWithRels[];
  }[] = [];
  if (season.teamRegistration) {
    const byTeam = new Map<
      string,
      {
        team: { id: string; name: string; leaderUserId: string | null };
        createdAt: number;
        drivers: RegWithRels[];
      }
    >();
    const noTeam: RegWithRels[] = [];
    for (const r of confirmedRegs) {
      if (r.isTeamManager) continue;
      if (r.team) {
        let g = byTeam.get(r.team.id);
        if (!g) {
          g = {
            team: {
              id: r.team.id,
              name: r.team.name,
              leaderUserId: r.team.leaderUserId,
            },
            createdAt: r.team.createdAt.getTime(),
            drivers: [],
          };
          byTeam.set(r.team.id, g);
        }
        g.drivers.push(r);
      } else {
        noTeam.push(r);
      }
    }
    const ordered = Array.from(byTeam.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
    for (const g of ordered) teamRoster.push({ team: g.team, drivers: g.drivers });
    if (noTeam.length > 0) teamRoster.push({ team: null, drivers: noTeam });
  }
  const teamRosterDriverCount = teamRoster.reduce(
    (s, g) => s + g.drivers.length,
    0
  );

  const teamClasses = await computeTeamClassStandings(prisma, seasonId);
  const isTeamEventSeason = teamClasses.length > 0;
  const classLeaders = isTeamEventSeason
    ? teamClasses
        .map((g) => {
          const top = g.teams[0];
          return top
            ? {
                shortCode: g.carClassShortCode,
                className: g.carClassName,
                teamName: top.teamName,
                points: top.totalPoints,
              }
            : null;
        })
        .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null)
    : null;

  // An archived season stays readable via its direct URL, but never offers a
  // way in — the action and the register page refuse it anyway.
  const registrationOpen =
    !season.isArchived &&
    (season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE");

  // Signed-in viewer with an active (pending/approved) registration sees
  // "Edit registration →" instead of "Register →". The registration token is
  // forwarded only for these users so their Edit link passes the link guard.
  const session = await auth();
  const ownRegistration = session?.user?.id
    ? await prisma.registration.findUnique({
        where: {
          seasonId_userId: { seasonId, userId: session.user.id },
        },
        select: { status: true },
      })
    : null;
  const ownActiveRegistration =
    ownRegistration?.status === "PENDING" ||
    ownRegistration?.status === "APPROVED";
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
    startNumber: string | null;
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
        currentLeader={isTeamEventSeason ? null : currentLeader}
        classLeaders={classLeaders}
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
        ownActiveRegistration={ownActiveRegistration}
        registerToken={
          ownActiveRegistration ? season.registrationToken : null
        }
        hasResults={hasResults}
        penaltyPoolMode={season.scoringSystem.penaltyPoolMode}
      />

      {season.league.garage61TeamUrl && (
        <div className="flex flex-wrap gap-2">
          <Garage61Link
            variant="button"
            url={season.league.garage61TeamUrl}
            label={`${season.league.name} on Garage 61`}
          />
        </div>
      )}

      {isTeamEventSeason && (
        <section>
          <h2 className="mb-3 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Class podiums
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {teamClasses.map((g) => (
              <div key={g.carClassId} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{g.carClassShortCode}</span>
                  <span className="font-display text-base font-semibold">{g.carClassName}</span>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {g.teams.slice(0, 3).map((t, i) => (
                    <li
                      key={t.teamId}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                      style={{
                        background:
                          i === 0
                            ? "linear-gradient(to right, rgba(234,179,8,0.18), transparent)"
                            : i === 1
                              ? "linear-gradient(to right, rgba(161,161,170,0.20), transparent)"
                              : "linear-gradient(to right, rgba(180,83,9,0.18), transparent)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium">{t.teamName}</span>
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-zinc-300">{t.totalPoints} pts</span>
                    </li>
                  ))}
                  {g.teams.length === 0 && (
                    <li className="text-xs text-zinc-500">No team finishes yet.</li>
                  )}
                </ol>
                {g.teams.length > 3 && (
                  <p className="mt-2 text-right text-xs text-zinc-500">+{g.teams.length - 3} more</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

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
                    <div className="flex flex-col items-end gap-0.5">
                      {r.status === "COMPLETED" && r._count.raceResults > 0 ? (
                        <Link
                          href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                          className="text-[#ff6b35] hover:underline"
                        >
                          Results →
                        </Link>
                      ) : r._count.raceResults > 0 ? (
                        <span className="text-xs text-zinc-500">Pending</span>
                      ) : (
                        <span className="text-xs">No results</span>
                      )}
                      <Link
                        href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}/grid`}
                        className="text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Grid &amp; waiting list →
                      </Link>
                    </div>
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

      {isTeamEventSeason && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Teams by class
            </h2>
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/standings`}
              className="text-xs text-orange-400 hover:underline"
            >
              View full standings →
            </Link>
          </div>
          {teamClasses.map((g) => (
            <details key={g.carClassId} open className="rounded border border-zinc-800 bg-zinc-900/50">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
                <span className="flex items-center gap-3">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{g.carClassShortCode}</span>
                  <span className="font-display text-base font-semibold">{g.carClassName}</span>
                  <span className="text-xs text-zinc-500">({g.teams.length} team{g.teams.length === 1 ? "" : "s"})</span>
                </span>
              </summary>
              <div className="border-t border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 w-10">Pos</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2 text-right">Best</th>
                      <th className="px-3 py-2 text-right">Rounds</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t, i) => (
                      <tr key={t.teamId} className="border-t border-zinc-800">
                        <td className="px-3 py-2 font-medium">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{t.teamName}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">
                          {t.bestClassFinish != null ? "P" + t.bestClassFinish : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.roundsCompleted}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )}
      {season.teamRegistration && (
        <section>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Roster ({teamRoster.length} team
              {teamRoster.length === 1 ? "" : "s"} · {teamRosterDriverCount}{" "}
              driver{teamRosterDriverCount === 1 ? "" : "s"})
            </h2>
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/roster`}
              className="text-xs text-orange-400 hover:underline"
            >
              Full roster →
            </Link>
          </div>
          {teamRosterDriverCount === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="No teams registered yet"
              description="Teams and their drivers will show up here once approved."
            />
          ) : (
            <div className="overflow-x-auto rounded border border-zinc-800">
              <SortableGroupedTableEnhancer
                tableId="seasonTeamRosterTable"
                groupCols={["team"]}
              />
              <table id="seasonTeamRosterTable" className="w-full text-sm">
                <thead className="bg-zinc-900 text-left align-bottom text-zinc-400">
                  <tr>
                    <th data-col="team" className="px-3 py-2 font-display tracking-wider">
                      Team
                    </th>
                    <th data-col="name" className="px-3 py-2 font-display tracking-wider">
                      Driver
                    </th>
                    {season.isMulticlass && (
                      <th data-col="class" className="px-3 py-2 font-display tracking-wider">
                        Class
                      </th>
                    )}
                    <th data-col="car" className="px-3 py-2 font-display tracking-wider">
                      Car
                    </th>
                    <th data-col="irid" className="px-3 py-2 font-display tracking-wider">
                      iRacing ID
                    </th>
                    <th data-col="irating" className="px-3 py-2 font-display tracking-wider">
                      iRating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamRoster.flatMap((g) =>
                    g.drivers.map((r, ri) => (
                      <tr
                        key={r.id}
                        data-group={g.team?.id ?? "none"}
                        data-r-team={g.team?.name ?? "No team"}
                        data-r-name={`${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim()}
                        data-r-class={r.carClass?.name ?? ""}
                        data-r-car={r.car?.name ?? ""}
                        data-r-irid={r.user.iracingMemberId ?? ""}
                        data-r-irating={r.iRating != null ? String(r.iRating) : ""}
                        className={ri === 0 ? "cw-group-start" : "cw-group-cont"}
                      >
                        <td className="px-3 py-2 align-top font-medium text-zinc-100">
                          <div className="cw-group-cell">
                            {g.team?.name ?? "No team"}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-medium">
                          <CountryFlag code={r.user.countryCode} />
                          {r.user.iracingMemberId ? (
                            <Link
                              href={`/drivers/${r.user.iracingMemberId}`}
                              className="hover:text-orange-400"
                            >
                              {r.user.firstName} {r.user.lastName}
                            </Link>
                          ) : (
                            <>
                              {r.user.firstName} {r.user.lastName}
                            </>
                          )}
                          {g.team?.leaderUserId === r.userId && (
                            <span className="ml-1 text-amber-400" title="Team leader">
                              ★
                            </span>
                          )}
                        </td>
                        {season.isMulticlass && (
                          <td className="px-3 py-2 text-zinc-400">
                            {r.carClass?.name ?? "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 text-zinc-400">
                          {r.car?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-400 tabular-nums">
                          {r.user.iracingMemberId ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-400 tabular-nums">
                          {r.iRating ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!season.teamRegistration && !isTeamEventSeason && (
      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Roster ({confirmedRegs.filter((r) => r.retiredAt == null).length} approved
          {season.maxDrivers != null ? ` / ${season.maxDrivers}` : ""})
        </h2>
        {confirmedRegs.length === 0 ? (
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
                  {season.isMulticlass && !season.proAmEnabled && (
                    <th className="px-3 py-2 font-display tracking-wider">Class</th>
                  )}
                  {season.proAmEnabled && (
                    <th className="px-3 py-2 font-display tracking-wider">Pro/Am</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {confirmedRegs.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-display text-zinc-500">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className={`px-3 py-2 font-medium ${r.retiredAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}>
                      <CountryFlag code={r.user.countryCode} />
                      {r.user.firstName} {r.user.lastName}
                      {r.retiredAt && (
                        <span className="ml-2 rounded bg-amber-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300 no-underline">
                          Retired
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.team?.name ?? "—"}
                    </td>
                    {season.isMulticlass && !season.proAmEnabled && (
                      <td className="px-3 py-2 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {season.proAmEnabled && (
                      <td className="px-3 py-2 text-zinc-400">
                        <ProAmBadge cls={r.proAmClass} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {waitlistRegs.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-cyan-400">
              Waiting list ({waitlistRegs.length})
            </h3>
            <p className="mb-2 text-xs text-zinc-500">
              The grid is full
              {season.maxDrivers != null ? ` (${season.maxDrivers} drivers)` : ""}.
              These drivers are next in line, in registration order — if a
              confirmed driver drops out of a race, the next gets the spot.
            </p>
            <div className="overflow-hidden rounded border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-left text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-display tracking-wider w-10">#</th>
                    <th className="px-3 py-2 font-display tracking-wider">Driver</th>
                    <th className="px-3 py-2 font-display tracking-wider">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistRegs.map((r, i) => (
                    <tr key={r.id} className="border-t border-zinc-800">
                      <td className="px-3 py-2 font-display text-cyan-300 tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <CountryFlag code={r.user.countryCode} />
                        {r.user.firstName} {r.user.lastName}
                      </td>
                      <td className="px-3 py-2 text-zinc-400 tabular-nums">
                        {fmtWaitDate(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
