import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicRostersIndex() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: [{ year: "desc" }, { name: "asc" }],
      },
    },
  });

  const counts = await prisma.registration.groupBy({
    by: ["seasonId"],
    where: { status: { in: ["APPROVED", "PENDING"] } },
    _count: { _all: true },
  });
  const approvedCount = new Map<string, number>(
    counts.map((c) => [c.seasonId, c._count._all])
  );

  const allSeasonsCount = leagues.reduce(
    (acc, l) => acc + l.seasons.length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rosters</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Browse the approved driver list for every season across every league.
        </p>
      </div>

      {allSeasonsCount === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No seasons yet.
        </p>
      ) : (
        <div className="space-y-6">
          {leagues
            .filter((league) => league.seasons.length > 0)
            .map((league) => (
            <section key={league.id}>
              <h2 className="mb-2 font-display text-base font-semibold tracking-wide">
                {league.name}
              </h2>
              {league.seasons.length === 0 ? (
                <p className="text-sm text-zinc-500">No seasons.</p>
              ) : (
                <div className="overflow-hidden rounded border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-left text-zinc-400">
                      <tr>
                        <th className="px-4 py-2">Season</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Drivers</th>
                        <th className="px-4 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {league.seasons.map((season) => (
                        <tr
                          key={season.id}
                          className="border-t border-zinc-800 hover:bg-zinc-900"
                        >
                          <td className="px-4 py-2 font-medium">
                            {season.name} {season.year}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={season.status} />
                          </td>
                          <td className="px-4 py-2 text-zinc-400">
                            {approvedCount.get(season.id) ?? 0}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Link
                              href={`/leagues/${league.slug}/seasons/${season.id}/roster`}
                              className="text-orange-400 hover:underline"
                            >
                              Open roster →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-zinc-800 text-zinc-400",
    OPEN_REGISTRATION: "bg-emerald-900 text-emerald-200",
    ACTIVE: "bg-blue-900 text-blue-200",
    COMPLETED: "bg-zinc-800 text-zinc-400",
    ARCHIVED: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${
        styles[status] ?? "bg-zinc-800 text-zinc-300"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
