#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create /drivers/[iracingMemberId]/page.tsx
# ============================================================================
echo "=== 1. Create driver page ==="
mkdir -p 'src/app/drivers/[iracingMemberId]'
PAGE='src/app/drivers/[iracingMemberId]/page.tsx'
if [ -f "$PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PAGE" <<'TSX'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DriverPage({
  params,
}: {
  params: Promise<{ iracingMemberId: string }>;
}) {
  const { iracingMemberId } = await params;

  const user = await prisma.user.findFirst({
    where: { iracingMemberId },
    include: {
      registrations: {
        where: { status: "APPROVED" },
        include: {
          season: { include: { league: true } },
          carClass: true,
          team: true,
          car: true,
          raceResults: {
            include: {
              round: {
                select: { roundNumber: true, name: true, startsAt: true },
              },
            },
            orderBy: [
              { round: { roundNumber: "asc" } },
              { raceNumber: "asc" },
            ],
          },
        },
        orderBy: [
          { season: { year: "desc" } },
          { season: { name: "asc" } },
        ],
      },
    },
  });

  if (!user) notFound();

  // ---------- career totals ----------
  const allResults = user.registrations.flatMap((r) => r.raceResults);
  const totalEntries = allResults.length;
  const finished = allResults.filter((r) => r.finishStatus === "CLASSIFIED");
  const wins = finished.filter((r) => r.finishPosition === 1).length;
  const podiums = finished.filter((r) => r.finishPosition <= 3).length;
  const top10 = finished.filter((r) => r.finishPosition <= 10).length;
  const dnfs = totalEntries - finished.length;
  const totalIncidents = allResults.reduce((s, r) => s + r.incidents, 0);
  const totalLaps = allResults.reduce((s, r) => s + r.lapsCompleted, 0);
  const avgFinishPos =
    finished.length > 0
      ? finished.reduce((s, r) => s + r.finishPosition, 0) / finished.length
      : 0;
  const avgIncidents = totalEntries > 0 ? totalIncidents / totalEntries : 0;

  // ---------- per-season breakdown ----------
  const perSeason = user.registrations.map((reg) => {
    const results = reg.raceResults;
    const totalPoints = results.reduce(
      (s, r) =>
        s +
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints +
        r.correctionPoints,
      0
    );
    const fin = results.filter((r) => r.finishStatus === "CLASSIFIED");
    const bestFinish =
      fin.length > 0 ? Math.min(...fin.map((r) => r.finishPosition)) : null;
    const avgFinish =
      fin.length > 0
        ? fin.reduce((s, r) => s + r.finishPosition, 0) / fin.length
        : null;
    return {
      reg,
      totalEntries: results.length,
      wins: fin.filter((r) => r.finishPosition === 1).length,
      podiums: fin.filter((r) => r.finishPosition <= 3).length,
      bestFinish,
      avgFinish,
      totalPoints,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/rosters"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← All rosters
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {user.firstName} {user.lastName}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          iRacing #{user.iracingMemberId}
        </p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Seasons" value={user.registrations.length} />
          <Stat label="Race entries" value={totalEntries} />
          <Stat label="Wins" value={wins} highlight={wins > 0} />
          <Stat label="Podiums" value={podiums} highlight={podiums > 0} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Top 10" value={top10} />
          <Stat label="DNFs" value={dnfs} />
          <Stat
            label="Avg finish"
            value={avgFinishPos > 0 ? avgFinishPos.toFixed(1) : "—"}
          />
          <Stat label="Avg inc./race" value={avgIncidents.toFixed(1)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-2">
          <Stat label="Total laps" value={totalLaps.toLocaleString()} />
          <Stat label="Total incidents" value={totalIncidents.toLocaleString()} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Per-season breakdown
        </h2>
        {perSeason.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
            No approved registrations.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Season</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Pro/Am</th>
                  <th className="px-3 py-2">Races</th>
                  <th className="px-3 py-2">Wins</th>
                  <th className="px-3 py-2">Pod.</th>
                  <th className="px-3 py-2">Best</th>
                  <th className="px-3 py-2">Avg</th>
                  <th className="px-3 py-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {perSeason.map((s) => (
                  <tr
                    key={s.reg.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/leagues/${s.reg.season.league.slug}/seasons/${s.reg.season.id}`}
                        className="hover:text-orange-400"
                      >
                        <div className="font-medium">
                          {s.reg.season.league.name}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {s.reg.season.name} {s.reg.season.year}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s.reg.carClass?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s.reg.proAmClass ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{s.totalEntries}</td>
                    <td className="px-3 py-2 text-zinc-400">{s.wins}</td>
                    <td className="px-3 py-2 text-zinc-400">{s.podiums}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s.bestFinish ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s.avgFinish !== null ? s.avgFinish.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{s.totalPoints}</td>
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
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border p-3 ${
        highlight
          ? "border-emerald-700/50 bg-emerald-950/30"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div
        className={`text-2xl font-bold ${highlight ? "text-emerald-300" : ""}`}
      >
        {value}
      </div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 2. Public roster: wrap driver names in a Link to their /drivers page
# ============================================================================
echo ""
echo "=== 2. Patch public roster to link driver names ==="
cat > /tmp/lm_roster_link.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('href={`/drivers/')) {
  console.log('  Already linked.');
  process.exit(0);
}

// Need a Link import
if (!/import Link from "next\/link"/.test(s)) {
  s = `import Link from "next/link";\n` + s;
}

// Wrap the driver name <div className="font-medium">{first} {last}</div> in a
// Link when iRacingMemberId is present. The roster page renders them as:
//   <td className="px-4 py-3">
//     <div className="font-medium">
//       {r.user.firstName} {r.user.lastName}
//     </div>
//   </td>
s = s.replace(
  /(<td className="px-4 py-3">\s*\n\s*)<div className="font-medium">\s*\n\s*\{r\.user\.firstName\} \{r\.user\.lastName\}\s*\n\s*<\/div>(\s*\n\s*<\/td>)/,
  `$1<div className="font-medium">
                    {r.user.iracingMemberId ? (
                      <Link
                        href={\`/drivers/\${r.user.iracingMemberId}\`}
                        className="hover:text-orange-400"
                      >
                        {r.user.firstName} {r.user.lastName}
                      </Link>
                    ) : (
                      <>
                        {r.user.firstName} {r.user.lastName}
                      </>
                    )}
                  </div>$2`
);

if (s === before) {
  console.error('  Roster anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_roster_link.js

echo ""
echo "-- Verify --"
echo "Driver page:"
ls -la 'src/app/drivers/[iracingMemberId]/page.tsx'
echo ""
echo "Roster link:"
grep -n '/drivers/' 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' | head -3

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
git commit -m "Public: per-driver stats page at /drivers/[iracingMemberId]; link driver names from public roster"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on any public roster, click a driver's name to land on their stats:"
echo "  • Career totals: seasons, entries, wins, podiums, top 10s, DNFs"
echo "  • Avg finish, avg incidents per race, total laps & incidents"
echo "  • Per-season table: class, Pro/Am, races, wins, pods, best/avg finish, points"
echo ""
echo "Direct URL pattern:  /drivers/<iracingMemberId>"
