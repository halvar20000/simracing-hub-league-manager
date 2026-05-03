#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. NAV: split single Admin link into Admin + Stewards
# ============================================================================
echo "=== 1. Patch nav.tsx ==="
cat > /tmp/lm_patch_nav.js <<'JS'
const fs = require('fs');
const FILE = 'src/components/nav.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Compute role + isFullAdmin (instead of just isAdmin)
s = s.replace(
  /let isAdmin = false;\s*\n\s*let pendingReports = 0;\s*\n\s*if \(session\?\.user\?\.id\) \{\s*\n\s*const user = await prisma\.user\.findUnique\(\{\s*\n\s*where: \{ id: session\.user\.id \},\s*\n\s*select: \{ role: true \},\s*\n\s*\}\);\s*\n\s*isAdmin = user\?\.role === "ADMIN" \|\| user\?\.role === "STEWARD";\s*\n\s*if \(isAdmin\) \{\s*\n\s*pendingReports = await prisma\.incidentReport\.count\(\{\s*\n\s*where: \{ status: "SUBMITTED" \},\s*\n\s*\}\);\s*\n\s*\}\s*\n\s*\}/,
  `let role: string | null = null;
  let pendingReports = 0;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    role = user?.role ?? null;
    if (role === "ADMIN" || role === "STEWARD") {
      pendingReports = await prisma.incidentReport.count({
        where: { status: "SUBMITTED" },
      });
    }
  }
  const isFullAdmin = role === "ADMIN";
  const isSteward = role === "ADMIN" || role === "STEWARD";`
);

// (b) Replace the single conditional Admin link with two separate links
s = s.replace(
  /\{isAdmin && \(\s*\n\s*<NavLink href="\/admin\/stewards">\s*\n\s*Admin\s*\n\s*\{pendingReports > 0 && \(\s*\n\s*<span className="ml-1 inline-block min-w-\[1\.25rem\] rounded-full bg-orange-500 px-1\.5 text-center text-\[10px\] font-bold leading-5 text-zinc-950">\s*\n\s*\{pendingReports\}\s*\n\s*<\/span>\s*\n\s*\)\}\s*\n\s*<\/NavLink>\s*\n\s*\)\}/,
  `{isFullAdmin && <NavLink href="/admin">Admin</NavLink>}
          {isSteward && (
            <NavLink href="/admin/stewards">
              Stewards
              {pendingReports > 0 && (
                <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-orange-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
                  {pendingReports}
                </span>
              )}
            </NavLink>
          )}`
);

if (s === before) {
  console.error('  No edits — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_nav.js

echo "-- Verify --"
grep -n 'isFullAdmin\|isSteward\|NavLink href="/admin' src/components/nav.tsx | head -10

# ============================================================================
# 2. ADMIN DASHBOARD: add 'Rosters' section listing live seasons
# ============================================================================
echo ""
echo "=== 2. Patch admin/page.tsx to add Rosters section ==="
cat > /tmp/lm_patch_admin.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add liveSeasons to the Promise.all destructure + query
s = s.replace(
  /const \[\s*\n\s*leagues,\s*\n\s*leagueCount,\s*\n\s*seasonCount,\s*\n\s*roundCount,\s*\n\s*userCount,\s*\n\s*teamCount,\s*\n\s*pendingRegs,\s*\n\s*pendingReports,\s*\n\s*\] = await Promise\.all\(\[/,
  `const [
    leagues,
    leagueCount,
    seasonCount,
    roundCount,
    userCount,
    teamCount,
    pendingRegs,
    pendingReports,
    liveSeasons,
  ] = await Promise.all([`
);

// (b) Append the new query just before the closing `]);` of the Promise.all
s = s.replace(
  /(prisma\.incidentReport\.count\(\{ where: \{ status: "SUBMITTED" \} \}\),\s*\n)(\s*\]\);)/,
  `$1    prisma.season.findMany({
      where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
      include: {
        league: { select: { name: true, slug: true } },
        _count: { select: { registrations: true } },
      },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    }),
$2`
);

// (c) Insert the Rosters section right BEFORE the existing Leagues section
if (!s.includes('>Active rosters<')) {
  s = s.replace(
    /(\s*<section>\s*\n\s*<h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">\s*\n\s*Leagues\s*\n\s*<\/h2>)/,
    `
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Active rosters
        </h2>
        {liveSeasons.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
            No seasons in OPEN_REGISTRATION or ACTIVE status.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">League</th>
                  <th className="px-3 py-2">Season</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Drivers</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {liveSeasons.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2 text-zinc-400">{s.league.name}</td>
                    <td className="px-3 py-2 font-medium">
                      {s.name} {s.year}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s._count.registrations}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={\`/admin/leagues/\${s.league.slug}/seasons/\${s.id}/roster\`}
                        className="text-orange-400 hover:underline"
                      >
                        Roster →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
$1`
  );
}

if (s === before) {
  console.error('  No edits — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_admin.js

echo "-- Verify --"
grep -n 'liveSeasons\|Active rosters' src/app/admin/page.tsx | head -10

# ============================================================================
# 3. PUBLIC ROSTER PAGE
# ============================================================================
echo ""
echo "=== 3. Create public roster page ==="
mkdir -p 'src/app/leagues/[slug]/seasons/[seasonId]/roster'
PUBLIC_ROSTER='src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'
if [ -f "$PUBLIC_ROSTER" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PUBLIC_ROSTER" <<'TSX'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicSeasonRoster({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { carClass: { displayOrder: "asc" } },
      { startNumber: "asc" },
      { user: { lastName: "asc" } },
    ],
  });

  const showClass = season.isMulticlass;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Roster</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {registrations.length} approved{" "}
          {registrations.length === 1 ? "driver" : "drivers"}
        </p>
      </div>

      {registrations.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No approved drivers yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">iRacing ID</th>
                <th className="px-4 py-3">Team</th>
                {showClass && <th className="px-4 py-3">Class</th>}
                <th className="px-4 py-3">Car</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-4 py-3 text-zinc-400">
                    {r.startNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.user.iracingMemberId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.team?.name ?? "Independent"}
                  </td>
                  {showClass && (
                    <td className="px-4 py-3 text-zinc-400">
                      {r.carClass?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-zinc-400">
                    {r.car?.name ?? "—"}
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
TSX
  echo "  Created."
fi

# ============================================================================
# 4. TS check
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "UX: split nav Admin/Stewards links, admin dashboard 'Active rosters' section, public per-season /roster page"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "What changes:"
echo "  • Top nav: 'Admin' (→ /admin) and 'Stewards' (→ /admin/stewards) are now"
echo "    separate links. The pending-report badge moved to 'Stewards'."
echo "  • Admins see both. Pure stewards see only 'Stewards'."
echo "  • Admin dashboard now has an 'Active rosters' section above 'Leagues',"
echo "    with a 'Roster →' link straight to each live season's admin roster."
echo "  • Public per-season roster page now lives at:"
echo "      https://league.simracing-hub.com/leagues/<slug>/seasons/<id>/roster"
echo "    No login required, full info shown for APPROVED drivers."
echo ""
echo "Follow-up (optional): I haven't yet patched the public season detail page"
echo "to add a visible 'Roster' link. Once you confirm the page renders cleanly,"
echo "I'll add a link in the season's nav so visitors can find it without typing"
echo "the URL."
