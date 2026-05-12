#!/usr/bin/env bash
# Combine admin dashboard + leagues, add Users + Teams pages,
# use the public-style league logo grid, refresh sidebar nav.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Unified /admin page (stats + league logo grid + quick links)
# ------------------------------------------------------------
echo ">>> Writing unified /admin dashboard..."

cat > src/app/admin/page.tsx <<'EOF'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
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
        <Stat
          label="Pending"
          value={pending}
          highlight={pending > 0}
        />
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
                    {activeSeason && ` • ${activeSeason.year}`}
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
EOF

# ------------------------------------------------------------
# 2. Sidebar nav — Dashboard, Users, Teams (Leagues moved into Dashboard)
# ------------------------------------------------------------
echo ">>> Updating admin sidebar..."

cat > src/app/admin/layout.tsx <<'EOF'
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Admin
        </h2>
        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/users"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Users
        </Link>
        <Link
          href="/admin/teams"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Teams
        </Link>
      </aside>
      <div>{children}</div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 3. /admin/leagues redirects to /admin
# ------------------------------------------------------------
echo ">>> Redirecting /admin/leagues to /admin..."

cat > src/app/admin/leagues/page.tsx <<'EOF'
import { redirect } from "next/navigation";

export default function AdminLeaguesRedirect() {
  redirect("/admin");
}
EOF

# ------------------------------------------------------------
# 4. /admin/users — list + promote/demote
# ------------------------------------------------------------
echo ">>> Writing admin users actions + page..."

cat > src/lib/actions/admin-users.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function promoteUserToAdmin(userId: string) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { role: "ADMIN" },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function demoteUserToDriver(userId: string) {
  const me = await requireAdmin();
  // Don't allow demoting yourself (avoid locking out)
  if (me.id === userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { role: "DRIVER" },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setUserActive(userId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
  revalidatePath("/admin/users");
}
EOF

mkdir -p src/app/admin/users

cat > src/app/admin/users/page.tsx <<'EOF'
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";
import {
  promoteUserToAdmin,
  demoteUserToDriver,
} from "@/lib/actions/admin-users";

export default async function AdminUsers() {
  const session = await auth();
  const myId = session?.user?.id;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {users.length} total — {users.filter((u) => u.role === "ADMIN").length}{" "}
          admin, {users.filter((u) => u.role === "DRIVER").length} driver
        </p>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">iRacing ID</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">
                  {u.firstName ?? ""} {u.lastName ?? u.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400">{u.email ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.iracingMemberId ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-3 py-2 text-zinc-500 text-xs">
                  {formatDateTime(u.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id === myId ? (
                    <span className="text-xs text-zinc-500">(you)</span>
                  ) : u.role === "ADMIN" ? (
                    <form action={demoteUserToDriver.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Make Driver
                      </button>
                    </form>
                  ) : (
                    <form action={promoteUserToAdmin.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="rounded bg-orange-500 px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-orange-400"
                      >
                        Promote to Admin
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-orange-900 text-orange-200",
    DRIVER: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${styles[role] ?? ""}`}
    >
      {role}
    </span>
  );
}
EOF

# ------------------------------------------------------------
# 5. /admin/teams — global list across all leagues/seasons
# ------------------------------------------------------------
echo ">>> Writing admin teams page..."
mkdir -p src/app/admin/teams

cat > src/app/admin/teams/page.tsx <<'EOF'
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
EOF

echo ""
echo "Done. Refresh the browser:"
echo "  - /admin shows: stats, quick links to Users / Teams, league logo grid"
echo "  - /admin/users: list with Promote/Demote buttons"
echo "  - /admin/teams: global teams list"
echo "  - Sidebar: Dashboard / Users / Teams"
echo "  - /admin/leagues now redirects to /admin"
