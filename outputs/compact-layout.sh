#!/usr/bin/env bash
# More aggressive compact layout:
#   - Home page: small hero, all 6 league logos in one row (no scroll on desktop)
#   - /leagues page: same compact 6-up grid
#   - League detail: tiny logo in top-left next to the name (corner placement)
# CAS Community logo on the home hero stays prominent but smaller.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# Home page — compact
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
    <div className="space-y-6">
      {/* Compact hero */}
      <section className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <img
          src="/logos/cas-community.webp"
          alt="CAS iRacing Community"
          className="h-16 w-16 object-contain sm:h-20 sm:w-20"
        />
        <div className="flex-1 text-center sm:text-left">
          <span className="tag tag-orange">CAS iRacing Community</span>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            League Manager
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Six championships • live standings • Fair Play Rating
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
          <Link
            href="/leagues"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Browse leagues →
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
                className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Flat 6-up league grid */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold tracking-wide">
          Championships
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/leagues/${league.slug}`}
                className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
                title={league.name}
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="h-12 w-full object-contain"
                  />
                ) : (
                  <div className="h-12 w-full rounded bg-zinc-800" />
                )}
                <div className="w-full">
                  <div className="truncate font-display text-xs font-semibold tracking-wide group-hover:text-[#ff6b35]">
                    {league.name}
                  </div>
                  {activeSeason && (
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                      {activeSeason.name} {activeSeason.year}
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
# /leagues page — same compact grid, full leagues list
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
    <div className="space-y-5">
      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-wide">
          Leagues
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {leagues.length} championship{leagues.length === 1 ? "" : "s"} run
          by the CAS iRacing community.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              title={league.name}
            >
              {league.logoUrl ? (
                <img
                  src={league.logoUrl}
                  alt={league.name}
                  className="h-12 w-full object-contain"
                />
              ) : (
                <div className="h-12 w-full rounded bg-zinc-800" />
              )}
              <div className="w-full">
                <div className="truncate font-display text-xs font-semibold tracking-wide group-hover:text-[#ff6b35]">
                  {league.name}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-zinc-500">
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
# League detail — small corner logo, no big hero
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
    <div className="space-y-6">
      <Link
        href="/leagues"
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← All leagues
      </Link>

      {/* Compact corner header */}
      <div className="flex items-center gap-4">
        {league.logoUrl && (
          <img
            src={league.logoUrl}
            alt={league.name}
            className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
          />
        )}
        <div>
          <span className="tag tag-orange">CAS Community</span>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {league.name}
          </h1>
          {league.description && (
            <p className="mt-1 text-sm text-zinc-400">{league.description}</p>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Seasons</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {league.seasons.map((s) => (
            <Link
              key={s.id}
              href={`/leagues/${league.slug}/seasons/${s.id}`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold tracking-wide">
                  {s.name} {s.year}
                </h3>
                <span className="tag tag-zinc">
                  {s.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
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

echo "Done. Refresh the browser tab."
