import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminLeaguesList() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { seasons: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leagues</h1>
        <Link
          href="/admin/leagues/new"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          + New League
        </Link>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">League</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Seasons</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leagues.map((league) => (
              <tr
                key={league.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {league.logoUrl ? (
                      <img
                        src={league.logoUrl}
                        alt={league.name}
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                    ) : (
                      <div className="h-6 w-6 shrink-0 rounded bg-zinc-800" />
                    )}
                    <span className="font-medium">{league.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-500">{league.slug}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {league._count.seasons}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leagues/${league.slug}`}
                    className="text-orange-400 hover:underline"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {leagues.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No leagues yet. Create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
