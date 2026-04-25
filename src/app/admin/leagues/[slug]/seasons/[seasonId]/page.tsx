import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminSeasonDetail({
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
      rounds: { orderBy: { roundNumber: "asc" } },
      _count: {
        select: {
          registrations: true,
          teams: true,
          carClasses: true,
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const pendingCount = await prisma.registration.count({
    where: { seasonId, status: "PENDING" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.league.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{season.name}</h1>
            <p className="text-sm text-zinc-400">
              {season.year} • {season.scoringSystem.name} •{" "}
              {season.status.replace("_", " ")}
            </p>
          </div>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/edit`}
            className="text-sm text-orange-400 hover:underline"
          >
            Edit season
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3 text-sm">
        <span className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-200">
          Calendar
        </span>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Roster ({season._count.registrations}
          {pendingCount > 0 && (
            <span className="ml-1 rounded bg-amber-900 px-1.5 text-xs text-amber-200">
              {pendingCount}
            </span>
          )}
          )
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Teams ({season._count.teams})
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Classes ({season._count.carClasses})
        </Link>
      </nav>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Rounds" value={season.rounds.length} />
        <Stat label="Drivers" value={season._count.registrations} />
        <Stat
          label="Multiclass"
          value={season.isMulticlass ? "Yes" : "No"}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Race calendar</h2>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + Add Round
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rd</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 text-zinc-500">{r.roundNumber}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(r.startsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}/edit`}
                      className="text-orange-400 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No rounds yet. Add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}
