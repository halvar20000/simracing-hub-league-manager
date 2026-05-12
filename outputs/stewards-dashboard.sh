#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. New page: /admin/stewards
# ===========================================================================
mkdir -p src/app/admin/stewards
cat > src/app/admin/stewards/page.tsx <<'TSX'
import Link from "next/link";
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function StewardsDashboard() {
  await requireSteward();

  // ---- counts ----
  const [submitted, underReview, decided, dismissed, withdrawn] =
    await Promise.all([
      prisma.incidentReport.count({ where: { status: "SUBMITTED" } }),
      prisma.incidentReport.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.incidentReport.count({ where: { status: "DECIDED" } }),
      prisma.incidentReport.count({ where: { status: "DISMISSED" } }),
      prisma.incidentReport.count({ where: { status: "WITHDRAWN" } }),
    ]);

  // ---- open queue (SUBMITTED + UNDER_REVIEW) ----
  const openReports = await prisma.incidentReport.findMany({
    where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });

  // ---- recently decided (last 10) ----
  const recentlyDecided = await prisma.incidentReport.findMany({
    where: { status: "DECIDED" },
    include: {
      round: { include: { season: { include: { league: true } } } },
      decision: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  // ---- Penalty pools (only seasons whose scoring system defers) ----
  const deferredSeasons = await prisma.season.findMany({
    where: { scoringSystem: { deferPenaltyPoints: true } },
    include: {
      league: { select: { name: true, slug: true } },
      scoringSystem: { select: { categoryPointsTable: true } },
    },
    orderBy: [{ year: "desc" }, { name: "asc" }],
  });
  const deferredSeasonIds = deferredSeasons.map((s) => s.id);
  const poolPenalties =
    deferredSeasonIds.length > 0
      ? await prisma.penalty.findMany({
          where: {
            type: "POINTS_DEDUCTION",
            round: { seasonId: { in: deferredSeasonIds } },
          },
          select: {
            pointsValue: true,
            forgivenPoints: true,
            releasedAt: true,
            round: { select: { seasonId: true } },
          },
        })
      : [];
  const poolBySeason = new Map<
    string,
    { pending: number; forgiven: number; released: number; count: number }
  >();
  for (const p of poolPenalties) {
    const sid = p.round.seasonId;
    const v = poolBySeason.get(sid) ?? {
      pending: 0,
      forgiven: 0,
      released: 0,
      count: 0,
    };
    const pts = p.pointsValue ?? 0;
    const eff = Math.max(0, pts - (p.forgivenPoints ?? 0));
    if (p.releasedAt) v.released += eff;
    else v.pending += eff;
    v.forgiven += p.forgivenPoints ?? 0;
    v.count += 1;
    poolBySeason.set(sid, v);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Stewards Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Single page to triage incident reports across all leagues and manage
          deferred penalty pools.
        </p>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Submitted" value={submitted} tone="amber" pulse={submitted > 0} />
        <Tile label="Under review" value={underReview} tone="blue" />
        <Tile label="Decided" value={decided} tone="emerald" />
        <Tile label="Dismissed" value={dismissed} tone="zinc" />
        <Tile label="Withdrawn" value={withdrawn} tone="zinc" />
      </div>

      {/* Penalty pools */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Penalty pools (deferred scoring systems)
        </h2>
        {deferredSeasons.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
            No scoring system has &quot;Defer penalty points&quot; enabled.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {deferredSeasons.map((s) => {
              const stats = poolBySeason.get(s.id) ?? {
                pending: 0,
                forgiven: 0,
                released: 0,
                count: 0,
              };
              return (
                <Link
                  key={s.id}
                  href={`/admin/leagues/${s.league.slug}/seasons/${s.id}/penalty-pool`}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 hover:border-orange-500/60 hover:bg-zinc-900"
                >
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    {s.league.name}
                  </div>
                  <div className="mt-0.5 text-base font-semibold">
                    {s.name}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                      pending {stats.pending}
                    </span>
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200">
                      forgiven {stats.forgiven}
                    </span>
                    <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                      released {stats.released}
                    </span>
                    <span className="ml-auto text-orange-400">Open pool →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Open queue */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Open queue ({openReports.length})
        </h2>
        {openReports.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
            No open reports. Inbox zero — nice.
          </p>
        ) : (
          <ReportsTable reports={openReports} />
        )}
      </section>

      {/* Recently decided */}
      {recentlyDecided.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Recently decided
          </h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">League / round</th>
                  <th className="px-3 py-2">Verdict</th>
                  <th className="px-3 py-2">Accused</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recentlyDecided.map((r) => {
                  const accused = r.involvedDrivers
                    .filter((d) => d.role === "ACCUSED")
                    .map(
                      (a) =>
                        `${a.registration.user.firstName ?? ""} ${
                          a.registration.user.lastName ?? ""
                        }`.trim()
                    )
                    .join(", ");
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-zinc-800 hover:bg-zinc-900"
                    >
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {r.decision?.publishedAt
                          ? formatDateTime(r.decision.publishedAt)
                          : formatDateTime(r.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-zinc-500">
                          {r.round.season.league.name}
                        </span>{" "}
                        — R{r.round.roundNumber} {r.round.name}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.decision?.verdict.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {accused || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/leagues/${r.round.season.league.slug}/seasons/${r.round.seasonId}/reports/${r.id}`}
                          className="text-orange-400 hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

type ReportRow = Awaited<ReturnType<typeof loadOpen>>[number];
async function loadOpen() {
  return prisma.incidentReport.findMany({
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
    },
  });
}

function ReportsTable({ reports }: { reports: ReportRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Submitted</th>
            <th className="px-3 py-2">League / round</th>
            <th className="px-3 py-2">Reporter</th>
            <th className="px-3 py-2">Accused</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const accused = r.involvedDrivers
              .filter((d) => d.role === "ACCUSED")
              .map(
                (a) =>
                  `${a.registration.user.firstName ?? ""} ${
                    a.registration.user.lastName ?? ""
                  }`.trim()
              )
              .join(", ");
            return (
              <tr
                key={r.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 text-xs text-zinc-400">
                  {formatDateTime(r.submittedAt)}
                </td>
                <td className="px-3 py-2">
                  <span className="text-zinc-500">
                    {r.round.season.league.name}
                  </span>{" "}
                  — R{r.round.roundNumber} {r.round.name}
                </td>
                <td className="px-3 py-2">
                  {r.reporterUser.firstName} {r.reporterUser.lastName}
                </td>
                <td className="px-3 py-2 text-zinc-400">{accused || "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/leagues/${r.round.season.league.slug}/seasons/${r.round.seasonId}/reports/${r.id}`}
                    className="text-orange-400 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "emerald" | "zinc";
  pulse?: boolean;
}) {
  const styles: Record<string, string> = {
    amber: "border-amber-700 bg-amber-950/30 text-amber-200",
    blue: "border-blue-700 bg-blue-950/30 text-blue-200",
    emerald: "border-emerald-700 bg-emerald-950/30 text-emerald-200",
    zinc: "border-zinc-700 bg-zinc-900 text-zinc-300",
  };
  return (
    <div
      className={`rounded border p-3 ${styles[tone]} ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUBMITTED: "bg-amber-900 text-amber-200",
    UNDER_REVIEW: "bg-blue-900 text-blue-200",
    DECIDED: "bg-emerald-900 text-emerald-200",
    DISMISSED: "bg-zinc-800 text-zinc-400",
    WITHDRAWN: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
TSX
echo "[+] Wrote src/app/admin/stewards/page.tsx"

# ===========================================================================
# 2. Sidebar: add a "Stewards" link visible to all admin/steward roles
# ===========================================================================
cat > outputs-tmp/patch-sidebar.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/layout.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes('href="/admin/stewards"')) {
  console.log("Sidebar: Stewards link already present.");
  process.exit(0);
}

const before = `        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>`;
const after = `        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/stewards"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Stewards
        </Link>`;
if (!s.includes(before)) { console.error("Sidebar: anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Sidebar: Stewards link added.");
EOF
node outputs-tmp/patch-sidebar.mjs

# ===========================================================================
# 3. Replace the inline StewardDashboard on /admin with a redirect
#    (stewards land on /admin/stewards now). Admins keep their dashboard.
# ===========================================================================
cat > outputs-tmp/patch-admin.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 3a. Add redirect import if missing.
if (!s.includes('import { redirect } from "next/navigation";')) {
  s = s.replace(
    `import Link from "next/link";`,
    `import Link from "next/link";\nimport { redirect } from "next/navigation";`
  );
}

// 3b. Replace `return <StewardDashboard />;` with a redirect.
s = s.replace(
  `  if (me.role === "STEWARD") {
    return <StewardDashboard />;
  }`,
  `  if (me.role === "STEWARD") {
    redirect("/admin/stewards");
  }`
);

// 3c. Add a prominent "Stewards Dashboard" link at the top of FullAdminDashboard
//     just under the H1 quick links.
if (!s.includes('href="/admin/stewards"')) {
  s = s.replace(
    `        <Link
          href="/admin/leagues/new"
          className="rounded bg-orange-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-orange-400"
        >
          + New League
        </Link>`,
    `        <Link
          href="/admin/stewards"
          className="rounded border border-amber-700 bg-amber-950/30 px-3 py-1.5 font-medium text-amber-200 hover:bg-amber-900/40"
        >
          Stewards Dashboard
        </Link>
        <Link
          href="/admin/leagues/new"
          className="rounded bg-orange-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-orange-400"
        >
          + New League
        </Link>`
  );
}

fs.writeFileSync(FILE, s);
console.log("Admin home: redirect for stewards + Stewards link for admins.");
EOF
node outputs-tmp/patch-admin.mjs

# ===========================================================================
# 4. Nav: send the badge straight to /admin/stewards
# ===========================================================================
cat > outputs-tmp/patch-nav.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/nav.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace the Admin nav link href with /admin/stewards.
const before = `          {isAdmin && (
            <NavLink href="/admin">
              Admin`;
const after = `          {isAdmin && (
            <NavLink href="/admin/stewards">
              Admin`;

if (s.includes('NavLink href="/admin/stewards"')) {
  console.log("Nav: Admin link already points to /admin/stewards.");
} else if (!s.includes(before)) {
  console.error("Nav: Admin link anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Nav: Admin badge link → /admin/stewards.");
}
EOF
node outputs-tmp/patch-nav.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type-check + commit + push
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Stewards: dedicated /admin/stewards dashboard with status tiles, open queue, recently decided + deferred penalty pools list"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
