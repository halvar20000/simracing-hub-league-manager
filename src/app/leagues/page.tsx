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
    <div className="space-y-6">
      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-2 font-display text-3xl font-bold">Leagues</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {leagues.length} championship
          {leagues.length === 1 ? "" : "s"} run by the CAS iRacing community.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <div className="flex h-40 items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6">
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-2xl text-zinc-700">
                    {league.name}
                  </span>
                )}
              </div>
              <div className="border-t border-zinc-800 p-4">
                <h3 className="font-display text-lg font-semibold tracking-wide group-hover:text-[#ff6b35]">
                  {league.name}
                </h3>
                {league.description && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {league.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    {league._count.seasons} season
                    {league._count.seasons === 1 ? "" : "s"}
                  </span>
                  {activeSeason && (
                    <span className="tag tag-orange">
                      {activeSeason.name} {activeSeason.year}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
