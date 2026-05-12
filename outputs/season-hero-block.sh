#!/usr/bin/env bash
# Season hero block: schedule poster as background + league/season title +
# progress / current leader / next-race countdown.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components

# ----------------------------------------------------------------
# 1) Client component: SeasonHero
# ----------------------------------------------------------------
cat > src/components/SeasonHero.tsx <<'EOF'
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type SeasonHeroProps = {
  slug: string;
  seasonId: string;
  leagueLogoUrl: string | null;
  leagueName: string;
  seasonName: string;
  seasonYear: number;
  scoringSystemName: string;
  status: string;
  isMulticlass: boolean;
  proAmEnabled: boolean;
  scheduleImageUrl: string | null;
  totalRounds: number;
  completedRounds: number;
  currentLeader: {
    firstName: string | null;
    lastName: string | null;
    startNumber: number | null;
    teamName: string | null;
    points: number;
  } | null;
  nextRound: {
    name: string;
    track: string;
    trackConfig: string | null;
    startsAtIso: string;
  } | null;
  registrationOpen: boolean;
  hasResults: boolean;
};

function formatCountdown(targetMs: number): string {
  const ms = targetMs - Date.now();
  if (ms <= 0) return "in progress";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `in ${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export function SeasonHero(p: SeasonHeroProps) {
  const targetMs = p.nextRound
    ? new Date(p.nextRound.startsAtIso).getTime()
    : null;
  const [countdown, setCountdown] = useState<string>(
    targetMs != null ? formatCountdown(targetMs) : ""
  );

  useEffect(() => {
    if (targetMs == null) return;
    const tick = () => setCountdown(formatCountdown(targetMs));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  const progressPct = Math.round(
    (p.completedRounds / Math.max(1, p.totalRounds)) * 100
  );
  const leaderName = p.currentLeader
    ? `${p.currentLeader.firstName ?? ""} ${p.currentLeader.lastName ?? ""}`.trim()
    : null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800">
      {p.scheduleImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.scheduleImageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/85 via-zinc-950/65 to-zinc-950/90" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-950" />
      )}

      <div className="relative z-10 p-5 sm:p-7">
        {/* League badge */}
        <div className="flex items-center gap-2">
          {p.leagueLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.leagueLogoUrl}
              alt={p.leagueName}
              className="h-7 w-7 shrink-0 object-contain"
            />
          ) : null}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300">
            {p.leagueName}
          </span>
        </div>

        {/* Title */}
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-4xl">
          {p.seasonName}{" "}
          <span className="text-zinc-400">{p.seasonYear}</span>
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          {p.scoringSystemName} • {p.status.replace("_", " ")}
          {p.isMulticlass && " • Multiclass"}
          {p.proAmEnabled && " • Pro/Am"}
        </p>

        {/* Three-card row: progress / leader / next race */}
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {/* Progress */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Progress
            </div>
            <div className="mt-1 font-display text-base font-bold text-zinc-100">
              Round {p.completedRounds} of {p.totalRounds}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-[#ff6b35]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Current Leader */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Current Leader
            </div>
            {p.currentLeader && leaderName ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.currentLeader.startNumber != null && (
                    <span className="mr-1.5 text-[#ff6b35]">
                      #{p.currentLeader.startNumber}
                    </span>
                  )}
                  {leaderName}
                </div>
                <div className="text-xs text-zinc-400">
                  {p.currentLeader.points} pts
                  {p.currentLeader.teamName
                    ? ` • ${p.currentLeader.teamName}`
                    : ""}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-500">
                {p.hasResults ? "—" : "No results yet"}
              </div>
            )}
          </div>

          {/* Next Race */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Next Race
            </div>
            {p.nextRound ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.nextRound.track}
                  {p.nextRound.trackConfig
                    ? ` (${p.nextRound.trackConfig})`
                    : ""}
                </div>
                <div className="text-xs text-[#ff6b35]">{countdown}</div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-400">Season complete</div>
            )}
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {p.hasResults && (
            <Link
              href={`/leagues/${p.slug}/seasons/${p.seasonId}/standings`}
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-[#ff8550]"
            >
              Standings →
            </Link>
          )}
          {p.registrationOpen && (
            <Link
              href={`/leagues/${p.slug}/seasons/${p.seasonId}/register`}
              className="rounded border border-[#ff6b35] px-3 py-1.5 text-xs font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
            >
              Register →
            </Link>
          )}
          <Link
            href={`/leagues/${p.slug}/seasons/${p.seasonId}/decisions`}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Decisions →
          </Link>
          {p.scheduleImageUrl && (
            <a
              href={p.scheduleImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Full schedule poster ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
EOF
echo "Wrote src/components/SeasonHero.tsx"

# ----------------------------------------------------------------
# 2) Rewrite the public season page to use SeasonHero
# ----------------------------------------------------------------
cat > 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { computeDriverStandings } from "@/lib/standings";
import { SeasonHero } from "@/components/SeasonHero";

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
                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">
                    No rounds scheduled yet.
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
          <p className="text-sm text-zinc-500">No approved drivers yet.</p>
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
EOF
echo "Wrote src/app/leagues/[slug]/seasons/[seasonId]/page.tsx"

git add -A
git commit -m "Public season page: hero block (schedule poster + progress + leader + countdown)"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Each public season page opens with a hero block: schedule poster as"
echo "    background, league badge, season title, three cards (progress / current"
echo "    leader / next race countdown), and CTAs."
echo "  - Countdown updates every minute client-side."
echo "  - Falls back to plain dark gradient if scheduleImageUrl is null."
