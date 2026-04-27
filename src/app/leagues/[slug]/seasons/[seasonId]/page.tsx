import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function PublicSeasonDetail({
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
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { _count: { select: { raceResults: true } } },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: { user: true, team: true, carClass: true },
        orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const registrationOpen =
    season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE";
  const hasResults = season.rounds.some((r) => r._count.raceResults > 0);

  return (
    <div className="space-y-4">
      <Link
        href={`/leagues/${slug}`}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← {season.league.name}
      </Link>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {season.league.logoUrl && (
            <img
              src={season.league.logoUrl}
              alt={season.league.name}
              className="h-9 w-9 shrink-0 object-contain"
            />
          )}
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
              {season.name} {season.year}
            </h1>
            <p className="text-[10px] text-zinc-400">
              {season.scoringSystem.name} • {season.status.replace("_", " ")}
              {season.isMulticlass && " • Multiclass"}
              {season.proAmEnabled && " • Pro/Am"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hasResults && (
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/standings`}
              className="rounded border border-[#ff6b35] px-3 py-1 text-xs font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
            >
              Standings →
            </Link>
          )}
          {registrationOpen && (
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/register`}
              className="rounded bg-[#ff6b35] px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-[#ff8550]"
            >
              Register →
            </Link>
          )}
        </div>
      </div>

      {season.scheduleImageUrl && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Schedule
          </h2>
          <a
            href={season.scheduleImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-2xl"
            title="Open full-size in new tab"
          >
            <img
              src={season.scheduleImageUrl}
              alt={`${season.name} schedule`}
              className="w-full rounded border border-zinc-800 transition-opacity hover:opacity-90"
            />
          </a>
        </section>
      )}

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Race calendar
        </h2>
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-display tracking-wider">Rd</th>
                <th className="px-3 py-2 font-display tracking-wider">Name</th>
                <th className="px-3 py-2 font-display tracking-wider">Track</th>
                <th className="px-3 py-2 font-display tracking-wider">Date</th>
                <th className="px-3 py-2 font-display tracking-wider">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-display text-zinc-500">
                    {r.roundNumber}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                      className="hover:text-[#ff6b35]"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {formatDateTime(r.startsAt)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {r._count.raceResults > 0 ? (
                      <Link
                        href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-[#ff6b35] hover:underline"
                      >
                        Results →
                      </Link>
                    ) : (
                      <span className="text-xs">No results</span>
                    )}
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-zinc-500"
                  >
                    No rounds scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved drivers yet.</p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-display tracking-wider">#</th>
                  <th className="px-3 py-2 font-display tracking-wider">Driver</th>
                  <th className="px-3 py-2 font-display tracking-wider">Team</th>
                  {season.isMulticlass && (
                    <th className="px-3 py-2 font-display tracking-wider">Class</th>
                  )}
                  {season.proAmEnabled && (
                    <th className="px-3 py-2 font-display tracking-wider">Pro/Am</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {season.registrations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-display text-zinc-500">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.team?.name ?? "—"}
                    </td>
                    {season.isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {season.proAmEnabled && (
                      <td className="px-3 py-2 text-zinc-400">
                        {r.proAmClass ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
