import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import CopyTextButton from "@/components/CopyTextButton";
import { regenerateRegistrationToken, clearRegistrationToken } from "@/lib/actions/seasons";

export default async function AdminSeasonDetail({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
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
  const reportCount = await prisma.incidentReport.count({
    where: { round: { seasonId } },
  });
  const reportNewCount = await prisma.incidentReport.count({
    where: { round: { seasonId }, status: "SUBMITTED" },
  });
  const pendingPenaltyCount = await prisma.penalty.count({
    where: {
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      round: { seasonId },
    },
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
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {season.league.logoUrl && (
              <img
                src={season.league.logoUrl}
                alt={season.league.name}
                className="h-9 w-9 shrink-0 object-contain"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">{season.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/admin/leagues/${slug}/seasons/${seasonId}/cars`}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                >
                  Manage cars →
                </Link>
              </div>
              <p className="text-sm text-zinc-400">
                {season.year} • {season.scoringSystem.name} •{" "}
                {season.status.replace("_", " ")}
              </p>
            </div>
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
          href={`/admin/leagues/${slug}/seasons/${seasonId}/reports`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Reports ({reportCount}
          {reportNewCount > 0 && (
            <span className="ml-1 rounded bg-amber-900 px-1.5 text-xs text-amber-200">
              {reportNewCount}
            </span>
          )}
          )
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/penalty-pool`}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Penalty pool
          {pendingPenaltyCount > 0 && (
            <span className="ml-1.5 inline-block min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
              {pendingPenaltyCount}
            </span>
          )}
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

      <section className="rounded border border-emerald-700/40 bg-emerald-900/10 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Registration link</h2>
        {(() => {
          const baseUrl =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXT_PUBLIC_BASE_URL ||
            process.env.NEXTAUTH_URL ||
            "https://league.simracing-hub.com";
          const path = `/leagues/${slug}/seasons/${season.id}/register`;
          const url = season.registrationToken
            ? `${baseUrl}${path}?t=${season.registrationToken}`
            : `${baseUrl}${path}`;
          return (
            <div className="space-y-3">
              {season.registrationToken ? (
                <p className="text-sm text-emerald-300">
                  Token-protected — only people with this exact link can register.
                </p>
              ) : (
                <p className="text-sm text-amber-300">
                  Open registration — anyone signed in can register without a token.
                </p>
              )}
              <code className="block break-all rounded bg-zinc-900 border border-zinc-800 p-2 text-xs">
                {url}
              </code>
              <div className="flex flex-wrap gap-2">
                <CopyTextButton text={url} label="Copy registration link" />
                <form action={regenerateRegistrationToken}>
                  <input type="hidden" name="seasonId" value={season.id} />
                  <button
                    type="submit"
                    className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                  >
                    {season.registrationToken
                      ? "Regenerate token"
                      : "Generate token (link-only)"}
                  </button>
                </form>
                {season.registrationToken && (
                  <form action={clearRegistrationToken}>
                    <input type="hidden" name="seasonId" value={season.id} />
                    <button
                      type="submit"
                      className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                    >
                      Clear token (open registration)
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })()}
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
                <th className="px-4 py-3">Results</th>
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
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                      className="hover:text-orange-400"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDateTime(r.startsAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r._count.raceResults}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <Link
                        href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-orange-400 hover:underline"
                      >
                        Results
                      </Link>
                      <Link
                        href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}/edit`}
                        className="text-zinc-400 hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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
