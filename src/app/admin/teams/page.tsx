import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminTeams() {
  const teams = await prisma.team.findMany({
    include: {
      season: { include: { league: true } },
      _count: { select: { registrations: true } },
    },
    orderBy: [
      { season: { league: { name: "asc" } } },
      { season: { year: "desc" } },
      { name: "asc" },
    ],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {teams.length} teams across all seasons.
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No teams yet. Teams get created by admins or by drivers during
          registration.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2">Season</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Drivers</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-3 py-2 text-zinc-400">
                    <Link
                      href={`/admin/leagues/${t.season.league.slug}`}
                      className="hover:text-orange-400"
                    >
                      {t.season.league.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {t.season.name} {t.season.year}
                  </td>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">
                    {t._count.registrations}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/leagues/${t.season.league.slug}/seasons/${t.season.id}/teams/${t.id}/edit`}
                      className="text-xs text-orange-400 hover:underline"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
