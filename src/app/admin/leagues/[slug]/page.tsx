import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminLeagueDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
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
      <div>
        <Link
          href="/admin/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← All leagues
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {league.logoUrl && (
              <img
                src={league.logoUrl}
                alt={league.name}
                className="h-9 w-9 shrink-0 object-contain"
              />
            )}
            <h1 className="text-2xl font-bold">{league.name}</h1>
          </div>
          <Link
            href={`/admin/leagues/${league.slug}/edit`}
            className="text-sm text-orange-400 hover:underline"
          >
            Edit league
          </Link>
        </div>
        {league.description && (
          <p className="mt-2 text-sm text-zinc-400">{league.description}</p>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Seasons</h2>
          <Link
            href={`/admin/leagues/${league.slug}/seasons/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + New Season
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scoring</th>
                <th className="px-4 py-3">Rounds</th>
                <th className="px-4 py-3">Drivers</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {league.seasons.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.year}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.scoringSystem.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s._count.rounds}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s._count.registrations}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leagues/${league.slug}/seasons/${s.id}`}
                      className="text-orange-400 hover:underline"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {league.seasons.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No seasons yet. Create the first one.
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-zinc-800 text-zinc-400",
    OPEN_REGISTRATION: "bg-blue-900 text-blue-200",
    ACTIVE: "bg-emerald-900 text-emerald-200",
    COMPLETED: "bg-zinc-900 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${colors[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
