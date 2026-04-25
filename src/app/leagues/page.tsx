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
      <h1 className="text-3xl font-bold">Leagues</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="block rounded border border-zinc-800 bg-zinc-900 p-5 hover:border-orange-500 hover:bg-zinc-800"
            >
              <h2 className="text-lg font-semibold">{league.name}</h2>
              {league.description && (
                <p className="mt-1 text-sm text-zinc-400">
                  {league.description}
                </p>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                {league._count.seasons} season
                {league._count.seasons === 1 ? "" : "s"}
                {activeSeason && (
                  <span className="ml-2 rounded bg-emerald-950 px-2 py-0.5 text-emerald-300">
                    {activeSeason.name} {activeSeason.year}
                  </span>
                )}
              </p>
            </Link>
          );
        })}
        {leagues.length === 0 && (
          <p className="text-zinc-500">No leagues yet.</p>
        )}
      </div>
    </div>
  );
}
