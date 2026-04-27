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
        <h1 className="mt-1 font-display text-lg font-bold tracking-wide">
          Leagues
        </h1>
      </div>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col items-center gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              title={league.name}
            >
              {league.logoUrl ? (
                <img
                  src={league.logoUrl}
                  alt={league.name}
                  className="h-5 w-full object-contain"
                />
              ) : (
                <div className="h-5 w-full rounded bg-zinc-800" />
              )}
              <div className="w-full">
                <div className="truncate font-display text-[10px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
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
