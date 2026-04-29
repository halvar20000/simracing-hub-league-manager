import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSteward } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/date";

export default async function AdminDashboard() {
  const me = await requireSteward();

  if (me.role === "STEWARD") {
    return <StewardDashboard />;
  }
  return <FullAdminDashboard />;
}

async function FullAdminDashboard() {
  const [
    leagues,
    leagueCount,
    seasonCount,
    roundCount,
    userCount,
    teamCount,
    pendingRegs,
    pendingReports,
  ] = await Promise.all([
    prisma.league.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { seasons: true } },
        seasons: {
          where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
          orderBy: { year: "desc" },
          take: 1,
        },
      },
    }),
    prisma.league.count(),
    prisma.season.count(),
    prisma.round.count(),
    prisma.user.count(),
    prisma.team.count(),
    prisma.registration.count({ where: { status: "PENDING" } }),
    prisma.incidentReport.count({ where: { status: "SUBMITTED" } }),
  ]);

  const pending = pendingRegs + pendingReports;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Leagues" value={leagueCount} />
        <Stat label="Seasons" value={seasonCount} />
        <Stat label="Rounds" value={roundCount} />
        <Stat label="Users" value={userCount} href="/admin/users" />
        <Stat label="Teams" value={teamCount} href="/admin/teams" />
        <Stat label="Pending" value={pending} highlight={pending > 0} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/users"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Users
        </Link>
        <Link
          href="/admin/teams"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Teams
        </Link>
        <Link
          href="/admin/scoring-systems"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Scoring systems
        </Link>
        <Link
          href="/admin/leagues/new"
          className="rounded bg-orange-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-orange-400"
        >
          + New League
        </Link>
      </div>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Leagues
        </h2>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/admin/leagues/${league.slug}`}
                className="group flex flex-col items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
                title={league.name}
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="h-9 w-full object-contain"
                  />
                ) : (
                  <div className="h-9 w-full rounded bg-zinc-800" />
                )}
                <div className="w-full">
                  <div className="truncate font-display text-xs font-semibold tracking-wide group-hover:text-[#ff6b35]">
                    {league.name}
                  </div>
                  <div className="truncate text-[10px] text-zinc-500">
                    {league._count.seasons} season
                    {league._count.seasons === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            );
          })}
          {leagues.length === 0 && (
            <p className="col-span-full text-sm text-zinc-500">
              No leagues yet. Create the first one.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

async function StewardDashboard() {
  const reports = await prisma.incidentReport.findMany({
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
      decision: true,
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });

  const open = reports.filter(
    (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
  );
  const decided = reports.filter((r) => r.status === "DECIDED");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Steward Dashboard</h1>
      <p className="text-sm text-zinc-400">
        You can review and decide on incident reports.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open" value={open.length} highlight={open.length > 0} />
        <Stat label="Decided" value={decided.length} />
        <Stat label="Total" value={reports.length} />
      </div>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Open reports
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-zinc-500">No open reports.</p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">League</th>
                  <th className="px-3 py-2">Round</th>
                  <th className="px-3 py-2">Reporter</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {open.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {formatDateTime(r.submittedAt)}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.round.season.league.name}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-zinc-500">
                        R{r.round.roundNumber}
                      </span>{" "}
                      {r.round.name}
                    </td>
                    <td className="px-3 py-2">
                      {r.reporterUser.firstName} {r.reporterUser.lastName}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/leagues/${r.round.season.league.slug}/seasons/${r.round.seasonId}/reports/${r.id}`}
                        className="text-[#ff6b35] hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
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

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number | string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <div
      className={`rounded border ${highlight ? "border-orange-700 bg-orange-950/30" : "border-zinc-800 bg-zinc-900"} p-3 ${href ? "hover:border-zinc-600" : ""}`}
    >
      <div
        className={`text-2xl font-bold ${highlight ? "text-orange-400" : ""}`}
      >
        {value}
      </div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUBMITTED: "bg-amber-900 text-amber-200",
    UNDER_REVIEW: "bg-blue-900 text-blue-200",
    DECIDED: "bg-emerald-900 text-emerald-200",
    DISMISSED: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
