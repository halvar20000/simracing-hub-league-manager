#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create /rosters public index page
# ============================================================================
echo "=== 1. Create /rosters page ==="
mkdir -p 'src/app/rosters'
ROSTERS_PAGE='src/app/rosters/page.tsx'
if [ -f "$ROSTERS_PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$ROSTERS_PAGE" <<'TSX'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicRostersIndex() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        orderBy: [{ year: "desc" }, { name: "asc" }],
      },
    },
  });

  const counts = await prisma.registration.groupBy({
    by: ["seasonId"],
    where: { status: "APPROVED" },
    _count: { _all: true },
  });
  const approvedCount = new Map<string, number>(
    counts.map((c) => [c.seasonId, c._count._all])
  );

  const allSeasonsCount = leagues.reduce(
    (acc, l) => acc + l.seasons.length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rosters</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Browse the approved driver list for every season across every league.
        </p>
      </div>

      {allSeasonsCount === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No seasons yet.
        </p>
      ) : (
        <div className="space-y-6">
          {leagues.map((league) => (
            <section key={league.id}>
              <h2 className="mb-2 font-display text-base font-semibold tracking-wide">
                {league.name}
              </h2>
              {league.seasons.length === 0 ? (
                <p className="text-sm text-zinc-500">No seasons.</p>
              ) : (
                <div className="overflow-hidden rounded border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-left text-zinc-400">
                      <tr>
                        <th className="px-4 py-2">Season</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Drivers</th>
                        <th className="px-4 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {league.seasons.map((season) => (
                        <tr
                          key={season.id}
                          className="border-t border-zinc-800 hover:bg-zinc-900"
                        >
                          <td className="px-4 py-2 font-medium">
                            {season.name} {season.year}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={season.status} />
                          </td>
                          <td className="px-4 py-2 text-zinc-400">
                            {approvedCount.get(season.id) ?? 0}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Link
                              href={`/leagues/${league.slug}/seasons/${season.id}/roster`}
                              className="text-orange-400 hover:underline"
                            >
                              Open roster →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-zinc-800 text-zinc-400",
    OPEN_REGISTRATION: "bg-emerald-900 text-emerald-200",
    ACTIVE: "bg-blue-900 text-blue-200",
    COMPLETED: "bg-zinc-800 text-zinc-400",
    ARCHIVED: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${
        styles[status] ?? "bg-zinc-800 text-zinc-300"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 2. Add 'Rosters' nav link right after 'Leagues'
# ============================================================================
echo ""
echo "=== 2. Add Rosters link to nav ==="
node -e "
const fs = require('fs');
const FILE = 'src/components/nav.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('href=\"/rosters\"')) {
  console.log('  Already linked.');
  process.exit(0);
}
const before = s;
s = s.replace(
  /<NavLink href=\"\/leagues\">Leagues<\/NavLink>/,
  '<NavLink href=\"/leagues\">Leagues</NavLink>\n          <NavLink href=\"/rosters\">Rosters</NavLink>'
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Added.');
"

echo "-- Verify --"
grep -n 'href="/leagues"\|href="/rosters"' src/components/nav.tsx | head -5

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Public: add top-level /rosters index listing all seasons grouped by league + nav link"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then:"
echo "  • Top nav now has 'Rosters' between 'Leagues' and the user links."
echo "  • https://league.simracing-hub.com/rosters lists every league with"
echo "    every season under it, status badge, approved-driver count, and a"
echo "    one-click 'Open roster →' link to the public per-season roster."
