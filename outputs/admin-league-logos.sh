#!/usr/bin/env bash
# Add league logos to the admin pages:
#   - /admin/leagues  → small 24px logo in each row
#   - /admin/leagues/[slug]  → 36px logo inline with the league name
#   - /admin/leagues/[slug]/seasons/[seasonId]  → 36px league logo in the header

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# /admin/leagues — list with logo column
# ------------------------------------------------------------
cat > src/app/admin/leagues/page.tsx <<'EOF'
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
EOF

# ------------------------------------------------------------
# /admin/leagues/[slug] — league detail with header logo
# ------------------------------------------------------------
cat > 'src/app/admin/leagues/[slug]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminLeagueDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
EOF

# ------------------------------------------------------------
# /admin/leagues/[slug]/seasons/[seasonId] — season detail with header logo
# ------------------------------------------------------------
cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

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
EOF

echo "Done. Admin pages now show league logos."
echo "Refresh browser tab."
