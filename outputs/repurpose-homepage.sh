#!/usr/bin/env bash
# Repurpose the public homepage:
#  - global "next race across all leagues" hero with live countdown
#  - latest results strip (top 3 per round, last 3 completed rounds)
#  - enriched league grid (logo + current leader + next race per league)
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components

# ----------------------------------------------------------------
# 1) NextRaceHero client component (countdown)
# ----------------------------------------------------------------
cat > src/components/NextRaceHero.tsx <<'EOF'
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

export function NextRaceHero({
  leagueName,
  leagueLogoUrl,
  leagueSlug,
  seasonId,
  roundId,
  roundName,
  trackName,
  trackConfig,
  startsAtIso,
}: {
  leagueName: string;
  leagueLogoUrl: string | null;
  leagueSlug: string;
  seasonId: string;
  roundId: string;
  roundName: string;
  trackName: string;
  trackConfig: string | null;
  startsAtIso: string;
}) {
  const targetMs = new Date(startsAtIso).getTime();
  const [countdown, setCountdown] = useState<string>(formatCountdown(targetMs));
  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(targetMs));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  return (
    <Link
      href={`/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`}
      className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
    >
      <div className="flex flex-wrap items-center gap-3">
        {leagueLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={leagueLogoUrl}
            alt={leagueName}
            className="h-10 w-10 shrink-0 object-contain"
          />
        )}
        <div className="flex-1 min-w-[10rem]">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Next race · {leagueName}
          </div>
          <div className="mt-0.5 font-display text-lg font-bold text-zinc-100">
            {trackName}
            {trackConfig ? ` (${trackConfig})` : ""}
          </div>
          <div className="text-xs text-zinc-400">{roundName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Starts
          </div>
          <div className="font-display text-xl font-bold text-[#ff6b35]">
            {countdown}
          </div>
        </div>
      </div>
    </Link>
  );
}
EOF
echo "Wrote src/components/NextRaceHero.tsx"

# ----------------------------------------------------------------
# 2) Rewrite src/app/page.tsx
# ----------------------------------------------------------------
cat > src/app/page.tsx <<'EOF'
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeDriverStandings } from "@/lib/standings";
import { CountryFlag } from "@/components/CountryFlag";
import { NextRaceHero } from "@/components/NextRaceHero";

type LeaderInfo = {
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  points: number;
} | null;

export default async function Home() {
  const session = await auth();

  // Pull every league with its most-recent (or active) season + that season's
  // rounds. We pick "most recent year" if no ACTIVE/OPEN_REGISTRATION season.
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        orderBy: [{ status: "asc" }, { year: "desc" }],
        take: 1,
        include: {
          rounds: {
            orderBy: { startsAt: "asc" },
            include: { _count: { select: { raceResults: true } } },
          },
        },
      },
    },
  });

  const now = Date.now();
  type Summary = {
    league: (typeof leagues)[number];
    season: (typeof leagues)[number]["seasons"][number] | null;
    leader: LeaderInfo;
    nextRound: (typeof leagues)[number]["seasons"][number]["rounds"][number] | null;
    hasResults: boolean;
  };
  const summaries: Summary[] = await Promise.all(
    leagues.map(async (league) => {
      const season = league.seasons[0] ?? null;
      if (!season)
        return { league, season, leader: null, nextRound: null, hasResults: false };

      const nextRound =
        season.rounds.find((r) => r.startsAt.getTime() > now) ?? null;
      const hasResults = season.rounds.some(
        (r) => r._count.raceResults > 0
      );

      let leader: LeaderInfo = null;
      if (hasResults) {
        try {
          const standings = await computeDriverStandings(prisma, season.id);
          const top = standings[0];
          if (top) {
            leader = {
              firstName: top.driverFirstName,
              lastName: top.driverLastName,
              countryCode: top.countryCode,
              points: top.combinedTotal,
            };
          }
        } catch {
          leader = null;
        }
      }

      return { league, season, leader, nextRound, hasResults };
    })
  );

  // Soonest next race across all leagues
  const upcoming = summaries
    .filter((s) => s.nextRound != null)
    .sort(
      (a, b) =>
        (a.nextRound?.startsAt.getTime() ?? Infinity) -
        (b.nextRound?.startsAt.getTime() ?? Infinity)
    );
  const soonest = upcoming[0] ?? null;

  // Latest 3 completed rounds across all leagues (with results)
  const recentRounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      raceResults: { some: {} },
    },
    orderBy: { startsAt: "desc" },
    take: 3,
    include: {
      season: { include: { league: true } },
      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true },
          },
        },
      },
    },
  });
  const recentPodiums = recentRounds.map((round) => {
    type Agg = {
      registrationId: string;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
      teamName: string | null;
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
          teamName: r.registration.team?.name ?? null,
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
    return { round, top3 };
  });

  return (
    <div className="space-y-4">
      {/* Top hero — CAS branding + sign-in */}
      <section className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/cas-community.webp"
          alt="CAS Community"
          className="h-9 w-9 shrink-0 object-contain"
        />
        <h1 className="flex-1 font-display text-base font-bold tracking-tight">
          CAS Community League Manager
        </h1>
        <div className="flex gap-1.5">
          <Link
            href="/leagues"
            className="rounded bg-[#ff6b35] px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Browse →
          </Link>
          {!session && (
            <form
              action={async () => {
                "use server";
                await signIn("discord");
              }}
            >
              <button
                type="submit"
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Soonest next race banner */}
      {soonest && soonest.nextRound && soonest.season && (
        <NextRaceHero
          leagueName={soonest.league.name}
          leagueLogoUrl={soonest.league.logoUrl}
          leagueSlug={soonest.league.slug}
          seasonId={soonest.season.id}
          roundId={soonest.nextRound.id}
          roundName={soonest.nextRound.name}
          trackName={soonest.nextRound.track}
          trackConfig={soonest.nextRound.trackConfig}
          startsAtIso={soonest.nextRound.startsAt.toISOString()}
        />
      )}

      {/* Latest results */}
      {recentPodiums.length > 0 && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Latest results
          </h2>
          <div className="space-y-1.5">
            {recentPodiums.map(({ round, top3 }) => (
              <Link
                key={round.id}
                href={`/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}`}
                className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-[#ff6b35]"
              >
                {round.season.league.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={round.season.league.logoUrl}
                    alt={round.season.league.name}
                    className="h-5 w-5 shrink-0 object-contain"
                  />
                )}
                <span className="text-zinc-400">
                  {round.season.league.name}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="font-medium text-zinc-200">{round.track}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  {top3.map((d, i) => (
                    <span key={d.registrationId} className="flex items-center gap-1">
                      <span className="text-zinc-500">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                      </span>
                      <CountryFlag code={d.countryCode} className="text-[12px] leading-none" />
                      <span className="text-zinc-200">
                        {d.firstName} {d.lastName}
                      </span>
                    </span>
                  ))}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Enriched league grid */}
      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Championships
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map(({ league, season, leader, nextRound }) => (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              title={league.name}
            >
              {league.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={league.logoUrl}
                  alt={league.name}
                  className="h-12 w-12 shrink-0 object-contain"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-semibold tracking-wide text-zinc-100 group-hover:text-[#ff6b35]">
                  {league.name}
                </div>
                {season ? (
                  <>
                    <div className="truncate text-[10px] text-zinc-500">
                      {season.name} {season.year}
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1">
                      <div>
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                          Leader
                        </div>
                        {leader ? (
                          <div className="truncate text-[11px] text-zinc-300">
                            <CountryFlag code={leader.countryCode} className="text-[12px] leading-none" />
                            {leader.firstName} {leader.lastName}
                            <span className="ml-1 text-zinc-500">
                              {leader.points}p
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-zinc-600">—</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                          Next race
                        </div>
                        {nextRound ? (
                          <div className="truncate text-[11px] text-zinc-300">
                            {nextRound.track}
                            <span className="ml-1 text-zinc-500">
                              {nextRound.startsAt.toISOString().slice(5, 10).replace("-", "/")}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-zinc-600">
                            Season complete
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-zinc-600">No active season</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
EOF
echo "Wrote src/app/page.tsx"

git add -A
git commit -m "Homepage: live next-race hero + latest results strip + enriched league grid"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
