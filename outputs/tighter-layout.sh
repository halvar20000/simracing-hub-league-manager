#!/usr/bin/env bash
# Tighter compact layout — much smaller logos, denser headers.
# Updates home, /leagues, /leagues/[slug], /leagues/[slug]/seasons/[seasonId]

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# Home page — very compact hero + tiny league grid
# ------------------------------------------------------------
cat > src/app/page.tsx <<'EOF'
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await auth();
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-5">
      {/* Tight one-line hero */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black px-4 py-3">
        <img
          src="/logos/cas-community.webp"
          alt="CAS Community"
          className="h-10 w-10 shrink-0 object-contain"
        />
        <div className="flex-1 min-w-[160px]">
          <span className="tag tag-orange">CAS Community</span>
          <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
            League Manager
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/leagues"
            className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
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
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 6-up flat league grid */}
      <section>
        <h2 className="mb-2 font-display text-sm font-semibold tracking-wider uppercase text-zinc-400">
          Championships
        </h2>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/leagues/${league.slug}`}
                className="group flex flex-col items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
                title={league.name}
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="h-8 w-full object-contain"
                  />
                ) : (
                  <div className="h-8 w-full rounded bg-zinc-800" />
                )}
                <div className="w-full">
                  <div className="truncate font-display text-[11px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
                    {league.name}
                  </div>
                  {activeSeason && (
                    <div className="truncate text-[9px] text-zinc-500">
                      {activeSeason.year}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# /leagues — same compact 6-up grid
# ------------------------------------------------------------
cat > src/app/leagues/page.tsx <<'EOF'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicLeaguesList() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { seasons: true } },
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-1 font-display text-xl font-bold tracking-wide">
          Leagues
        </h1>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              title={league.name}
            >
              {league.logoUrl ? (
                <img
                  src={league.logoUrl}
                  alt={league.name}
                  className="h-8 w-full object-contain"
                />
              ) : (
                <div className="h-8 w-full rounded bg-zinc-800" />
              )}
              <div className="w-full">
                <div className="truncate font-display text-[11px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
                  {league.name}
                </div>
                <div className="truncate text-[9px] text-zinc-500">
                  {league._count.seasons} season
                  {league._count.seasons === 1 ? "" : "s"}
                  {activeSeason && ` • ${activeSeason.year}`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# League detail — small inline corner logo
# ------------------------------------------------------------
cat > 'src/app/leagues/[slug]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

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
        },
      },
    },
  });

  if (!league) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/leagues"
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← All leagues
      </Link>

      <div className="flex items-center gap-3">
        {league.logoUrl && (
          <img
            src={league.logoUrl}
            alt={league.name}
            className="h-8 w-8 shrink-0 object-contain"
          />
        )}
        <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
          {league.name}
        </h1>
      </div>
      {league.description && (
        <p className="text-sm text-zinc-400">{league.description}</p>
      )}

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Seasons
        </h2>
        <div className="grid gap-2 md:grid-cols-2">
          {league.seasons.map((s) => (
            <Link
              key={s.id}
              href={`/leagues/${league.slug}/seasons/${s.id}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold tracking-wide">
                  {s.name} {s.year}
                </h3>
                <span className="tag tag-zinc">
                  {s.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {s.scoringSystem.name} • {s._count.rounds} round
                {s._count.rounds === 1 ? "" : "s"} • {s._count.registrations}{" "}
                driver{s._count.registrations === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
          {league.seasons.length === 0 && (
            <p className="text-zinc-500">No seasons yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# Season detail — small inline corner logo
# ------------------------------------------------------------
cat > 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="space-y-5">
      <Link
        href={`/leagues/${slug}`}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← {season.league.name}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {season.league.logoUrl && (
            <img
              src={season.league.logoUrl}
              alt={season.league.name}
              className="h-8 w-8 shrink-0 object-contain"
            />
          )}
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {season.name} {season.year}
            </h1>
            <p className="text-xs text-zinc-400">
              {season.scoringSystem.name} • {season.status.replace("_", " ")}
              {season.isMulticlass && " • Multiclass"}
              {season.proAmEnabled && " • Pro/Am"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasResults && (
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/standings`}
              className="rounded border border-[#ff6b35] px-3 py-1.5 text-sm font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
            >
              Standings →
            </Link>
          )}
          {registrationOpen && (
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/register`}
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-[#ff8550]"
            >
              Register →
            </Link>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Race calendar
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
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
                    {new Date(r.startsAt).toLocaleString()}
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
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-zinc-500"
                  >
                    No rounds scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved drivers yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
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

echo "Done. Refresh the browser tab."
