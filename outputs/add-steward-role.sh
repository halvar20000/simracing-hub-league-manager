#!/usr/bin/env bash
# Add a third role: STEWARD.
# - Stewards can review and decide on incident reports
# - Stewards cannot manage leagues, seasons, drivers, results, or other admin data
# - The /admin layout allows STEWARD or ADMIN; admin-only pages explicitly require ADMIN
# - Steward dashboard at /admin shows pending reports across all seasons

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Schema: add STEWARD enum value
# ------------------------------------------------------------
echo ">>> Adding STEWARD to Role enum..."
node -e "
const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('STEWARD')) {
  console.log('  Already present.');
} else {
  s = s.replace(/enum Role \{\s+ADMIN\s+DRIVER\s+\}/, 'enum Role {\n  ADMIN\n  STEWARD\n  DRIVER\n}');
  fs.writeFileSync(p, s);
  console.log('  Added.');
}
"

echo ">>> Pushing schema..."
npx prisma db push
npx prisma generate

# ------------------------------------------------------------
# 2. Auth helpers: add requireSteward
# ------------------------------------------------------------
echo ">>> Updating auth helpers..."

cat > src/lib/auth-helpers.ts <<'EOF'
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }
  return session.user;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return user;
}

/**
 * Allows STEWARD or ADMIN access (used for incident reports / decisions).
 */
export async function requireSteward() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user || (user.role !== "ADMIN" && user.role !== "STEWARD")) {
    redirect("/");
  }

  return user;
}
EOF

# ------------------------------------------------------------
# 3. /admin layout uses requireSteward (allows both roles to enter)
# ------------------------------------------------------------
echo ">>> Updating /admin layout..."

cat > src/app/admin/layout.tsx <<'EOF'
import Link from "next/link";
import { requireSteward } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireSteward();
  const isAdmin = me.role === "ADMIN";

  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {isAdmin ? "Admin" : "Steward"}
        </h2>
        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        {isAdmin && (
          <>
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
          </>
        )}
      </aside>
      <div>{children}</div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 4. /admin page branches by role
# ------------------------------------------------------------
echo ">>> Updating /admin dashboard..."

cat > src/app/admin/page.tsx <<'EOF'
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
EOF

# ------------------------------------------------------------
# 5. admin-reports actions: use requireSteward (stewards can decide)
# ------------------------------------------------------------
echo ">>> Updating admin-reports actions to allow stewards..."

node -e "
const fs = require('fs');
const path = 'src/lib/actions/admin-reports.ts';
let s = fs.readFileSync(path, 'utf8');
s = s.replace(/from \"@\/lib\/auth-helpers\";/, 'from \"@/lib/auth-helpers\";');
s = s.replace(/import \{ requireAdmin \} from \"@\/lib\/auth-helpers\";/, 'import { requireSteward } from \"@/lib/auth-helpers\";');
s = s.replace(/await requireAdmin\(\)/g, 'await requireSteward()');
fs.writeFileSync(path, s);
console.log('  Patched admin-reports.ts');
"

# ------------------------------------------------------------
# 6. Reports queue + editor — add explicit requireSteward (defense in depth)
# ------------------------------------------------------------
echo ">>> Adding explicit requireSteward to reports pages..."

node -e "
const fs = require('fs');
const files = [
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx',
];
for (const path of files) {
  let s = fs.readFileSync(path, 'utf8');
  if (s.includes('requireSteward')) continue;

  // Add import
  if (s.includes('from \"@/lib/auth-helpers\"')) {
    s = s.replace(/import \{ ([^}]+) \} from \"@\/lib\/auth-helpers\";/, (m, names) => {
      if (names.includes('requireSteward')) return m;
      return 'import { ' + names.trim() + ', requireSteward } from \"@/lib/auth-helpers\";';
    });
  } else {
    s = 'import { requireSteward } from \"@/lib/auth-helpers\";\n' + s;
  }

  // Insert call at top of default function body
  s = s.replace(/export default async function (\w+)\(([^)]*)\) ?\{/, 'export default async function \$1(\$2) {\n  await requireSteward();');

  fs.writeFileSync(path, s);
  console.log('  Patched ' + path);
}
"

# ------------------------------------------------------------
# 7. Add requireAdmin to all admin-only pages (since layout no longer enforces ADMIN)
# ------------------------------------------------------------
echo ">>> Adding requireAdmin to all admin-only pages..."

node -e "
const fs = require('fs');
const files = [
  'src/app/admin/users/page.tsx',
  'src/app/admin/teams/page.tsx',
  'src/app/admin/leagues/new/page.tsx',
  'src/app/admin/leagues/[slug]/page.tsx',
  'src/app/admin/leagues/[slug]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/new/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/[registrationId]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/new/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/[teamId]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/new/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/[classId]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/new/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit/page.tsx',
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import/page.tsx',
];

for (const path of files) {
  if (!fs.existsSync(path)) {
    console.log('  Skip (missing): ' + path);
    continue;
  }
  let s = fs.readFileSync(path, 'utf8');

  if (s.includes('await requireAdmin()')) {
    continue;
  }

  // Add import if missing
  if (s.includes('from \"@/lib/auth-helpers\"')) {
    s = s.replace(/import \{ ([^}]+) \} from \"@\/lib\/auth-helpers\";/, (m, names) => {
      if (names.includes('requireAdmin')) return m;
      return 'import { ' + names.trim() + ', requireAdmin } from \"@/lib/auth-helpers\";';
    });
  } else {
    s = 'import { requireAdmin } from \"@/lib/auth-helpers\";\n' + s;
  }

  // Insert call at top of default async function body
  s = s.replace(/export default async function (\w+)\(([^)]*)\) ?\{/, 'export default async function \$1(\$2) {\n  await requireAdmin();');

  fs.writeFileSync(path, s);
  console.log('  Patched ' + path);
}
"

# ------------------------------------------------------------
# 8. admin-users actions — add Steward role transitions
# ------------------------------------------------------------
echo ">>> Updating admin-users actions..."

cat > src/lib/actions/admin-users.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { Role } from "@prisma/client";

export async function setUserRole(userId: string, role: Role) {
  const me = await requireAdmin();
  // Don't allow yourself to lose admin
  if (me.id === userId && role !== "ADMIN") return;
  await prisma.user.update({ where: { id: userId }, data: { role } });
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

# ------------------------------------------------------------
# 9. Users page — show STEWARD option, switch to dropdown
# ------------------------------------------------------------
echo ">>> Updating users page UI..."

cat > src/app/admin/users/page.tsx <<'EOF'
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/date";
import { setUserRole } from "@/lib/actions/admin-users";
import type { Role } from "@prisma/client";

export default async function AdminUsers() {
  await requireAdmin();
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
          admin, {users.filter((u) => u.role === "STEWARD").length} steward,{" "}
          {users.filter((u) => u.role === "DRIVER").length} driver
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
              <th className="px-3 py-2 text-right">Set role</th>
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
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {formatDateTime(u.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id === myId ? (
                    <span className="text-xs text-zinc-500">(you)</span>
                  ) : (
                    <RoleSelector currentRole={u.role} userId={u.id} />
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

function RoleSelector({
  currentRole,
  userId,
}: {
  currentRole: Role;
  userId: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      {(["ADMIN", "STEWARD", "DRIVER"] as Role[]).map((role) => (
        <form key={role} action={setUserRole.bind(null, userId, role)}>
          <button
            type="submit"
            disabled={currentRole === role}
            className={`rounded px-2 py-1 text-xs ${
              currentRole === role
                ? "cursor-default bg-zinc-800 text-zinc-500"
                : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {role.charAt(0) + role.slice(1).toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-orange-900 text-orange-200",
    STEWARD: "bg-blue-900 text-blue-200",
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
# 10. Nav: show "Admin" link for stewards too
# ------------------------------------------------------------
echo ">>> Updating nav so stewards see the Admin link..."

node -e "
const fs = require('fs');
const path = 'src/components/nav.tsx';
let s = fs.readFileSync(path, 'utf8');
// isAdmin → also include STEWARD as 'isStaff'
s = s.replace(
  /isAdmin = user\?\.role === \"ADMIN\";/,
  'isAdmin = user?.role === \"ADMIN\" || user?.role === \"STEWARD\";'
);
fs.writeFileSync(path, s);
console.log('  Nav now shows Admin link for STEWARD too.');
"

echo ""
echo "Done."
echo ""
echo "What's new:"
echo "  - Role enum has STEWARD added"
echo "  - /admin/users — promote anyone to Admin / Steward / Driver via three buttons"
echo "  - Stewards can sign in, see /admin (steward dashboard with all reports), and"
echo "    open + decide on reports. They cannot manage leagues, drivers, results, etc."
echo "  - Admins still see the full dashboard"
echo ""
echo "Test by promoting a test user to Steward and signing in as them."
