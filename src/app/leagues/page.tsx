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
