import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminTeams() {
  await requireAdmin();
  const teams = await prisma.team.findMany({
    include: {
      season: { include: { league: true } },
      registrations: {
        include: { user: true },
        orderBy: [
          { user: { lastName: "asc" } },
          { user: { firstName: "asc" } },
        ],
      },
      _count: { select: { registrations: true } },
    },
    orderBy: [
      { name: "asc" },
      { season: { league: { name: "asc" } } },
      { season: { year: "desc" } },
    ],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {teams.length} teams across all seasons. Click a team to see its
          drivers.
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500">No teams yet.</p>
      ) : (
        <div className="space-y-1.5">
          {teams.map((t) => (
            <details
              key={t.id}
              className="overflow-hidden rounded border border-zinc-800"
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
                <span className="flex-1 min-w-[10rem] font-medium">
                  {t.name}
                </span>
                <span className="min-w-[14rem] text-zinc-400">
                  {t.season.league.name}
                  <span className="ml-2 text-xs text-zinc-500">
                    {t.season.name} {t.season.year}
                  </span>
                </span>
                <span className="w-24 text-right text-zinc-400">
                  {t._count.registrations}{" "}
                  {t._count.registrations === 1 ? "driver" : "drivers"}
                </span>
                <Link
                  href={`/admin/leagues/${t.season.league.slug}/seasons/${t.season.id}/teams/${t.id}/edit`}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Edit
                </Link>
              </summary>
              {t.registrations.length === 0 ? (
                <p className="px-4 py-2 text-xs text-zinc-500">
                  No drivers registered to this team.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-1.5">Driver</th>
                      <th className="px-3 py-1.5">iRacing ID</th>
                      <th className="px-3 py-1.5 text-right">#</th>
                      <th className="px-3 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.registrations.map((reg) => (
                      <tr
                        key={reg.id}
                        className="border-t border-zinc-800"
                      >
                        <td className="px-3 py-1.5">
                          {reg.user.firstName} {reg.user.lastName}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500 tabular-nums">
                          {reg.user.iracingMemberId ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-zinc-500 tabular-nums">
                          {reg.startNumber ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">
                          {reg.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
