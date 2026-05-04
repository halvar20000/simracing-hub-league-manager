#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create public season stats page
# ============================================================================
echo "=== 1. Create /leagues/[slug]/seasons/[seasonId]/stats page ==="
mkdir -p 'src/app/leagues/[slug]/seasons/[seasonId]/stats'
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/stats/page.tsx'
if [ -f "$PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PAGE" <<'TSX'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicSeasonStats({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      rounds: {
        where: { countsForChampionship: true },
        orderBy: { roundNumber: "asc" },
        include: {
          raceResults: {
            select: {
              registrationId: true,
              finishStatus: true,
              iRating: true,
              incidents: true,
              lapsCompleted: true,
            },
          },
        },
      },
      registrations: {
        where: { status: "APPROVED" },
        select: {
          id: true,
          proAmClass: true,
          teamId: true,
        },
      },
    },
  });
  if (!season || season.league.slug !== slug) notFound();

  // ---------- driver counts ----------
  const totalDrivers = season.registrations.length;
  const proCount = season.registrations.filter(
    (r) => r.proAmClass === "PRO"
  ).length;
  const amCount = season.registrations.filter(
    (r) => r.proAmClass === "AM"
  ).length;
  const unrankedCount = totalDrivers - proCount - amCount;
  const teamCount = new Set(
    season.registrations.map((r) => r.teamId).filter(Boolean) as string[]
  ).size;

  // ---------- per-round participation ----------
  const roundData = season.rounds.map((r) => {
    const distinctRegIds = new Set(r.raceResults.map((rr) => rr.registrationId));
    const entries = distinctRegIds.size;
    const finishers = r.raceResults.filter(
      (rr) => rr.finishStatus === "CLASSIFIED"
    ).length;
    const dnfs = r.raceResults.filter(
      (rr) => rr.finishStatus !== "CLASSIFIED"
    ).length;
    return {
      roundId: r.id,
      roundNumber: r.roundNumber,
      name: r.name,
      track: r.track,
      entries,
      finishers,
      dnfs,
      hasResults: r.raceResults.length > 0,
    };
  });
  const completedRounds = roundData.filter((r) => r.hasResults);
  const maxEntries = Math.max(1, ...roundData.map((r) => r.entries));
  const avgGridSize =
    completedRounds.length > 0
      ? completedRounds.reduce((sum, r) => sum + r.entries, 0) /
        completedRounds.length
      : 0;

  // ---------- iRating ----------
  const allResults = season.rounds.flatMap((r) => r.raceResults);
  const ratings = allResults
    .map((rr) => rr.iRating)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const avgIRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const minIRating = ratings.length > 0 ? Math.min(...ratings) : 0;
  const maxIRating = ratings.length > 0 ? Math.max(...ratings) : 0;

  // ---------- race totals ----------
  const totalEntries = allResults.length;
  const totalLaps = allResults.reduce((sum, rr) => sum + rr.lapsCompleted, 0);
  const totalIncidents = allResults.reduce((sum, rr) => sum + rr.incidents, 0);
  const avgIncidents =
    totalEntries > 0 ? totalIncidents / totalEntries : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Season statistics</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.status.replace("_", " ")} • {roundData.length} round
          {roundData.length === 1 ? "" : "s"} scheduled
        </p>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Approved drivers" value={totalDrivers} />
          <Stat
            label="Rounds completed"
            value={`${completedRounds.length} / ${roundData.length}`}
          />
          <Stat label="Avg grid size" value={avgGridSize.toFixed(1)} />
          <Stat
            label="Avg iRating"
            value={
              avgIRating > 0 ? Math.round(avgIRating).toLocaleString() : "—"
            }
          />
        </div>
      </section>

      {roundData.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Participation per round
          </h2>
          <div className="space-y-1.5">
            {roundData.map((r) => (
              <div key={r.roundId} className="flex items-center gap-3">
                <div className="w-10 shrink-0 text-xs text-zinc-500">
                  R{r.roundNumber}
                </div>
                <div className="relative h-7 flex-1 rounded bg-zinc-900">
                  <div
                    className="h-7 rounded bg-orange-500/70"
                    style={{
                      width: `${(r.entries / maxEntries) * 100}%`,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-2 text-xs">
                    <span className="truncate text-zinc-100">{r.name}</span>
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right text-xs text-zinc-400">
                  {r.hasResults
                    ? `${r.entries} entries · ${r.finishers} fin.`
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Pro/Am breakdown
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pro" value={proCount} tone="emerald" />
          <Stat label="Am" value={amCount} />
          <Stat label="Unranked" value={unrankedCount} tone="muted" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          iRating distribution
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Average"
            value={
              avgIRating > 0 ? Math.round(avgIRating).toLocaleString() : "—"
            }
          />
          <Stat
            label="Highest"
            value={maxIRating > 0 ? maxIRating.toLocaleString() : "—"}
          />
          <Stat
            label="Lowest"
            value={minIRating > 0 ? minIRating.toLocaleString() : "—"}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Race totals
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total entries" value={totalEntries.toLocaleString()} />
          <Stat label="Total laps" value={totalLaps.toLocaleString()} />
          <Stat label="Total incidents" value={totalIncidents.toLocaleString()} />
          <Stat label="Avg inc./entry" value={avgIncidents.toFixed(1)} />
        </div>
      </section>

      <section>
        <Stat label="Teams" value={teamCount} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "muted";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-700/50 bg-emerald-950/30"
      : tone === "muted"
        ? "border-zinc-800 bg-zinc-950"
        : "border-zinc-800 bg-zinc-900";
  return (
    <div className={`rounded border p-3 ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 2. Link from admin season page (next to Pro/Am calculator)
# ============================================================================
echo ""
echo "=== 2. Add Statistics link to admin season page ==="
cat > /tmp/lm_stats_link.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('/stats`}')) {
  console.log('  Already linked.');
  process.exit(0);
}
const before = s;
s = s.replace(
  /(href=\{`\/admin\/leagues\/\$\{slug\}\/seasons\/\$\{seasonId\}\/pro-am`\}[\s\S]*?Pro\/Am calculator →[\s\S]*?<\/Link>)/,
  `$1
                <Link
                  href={\`/leagues/\${slug}/seasons/\${seasonId}/stats\`}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                >
                  Statistics →
                </Link>`
);
if (s === before) {
  console.error('  Anchor not found — Pro/Am link may have been edited.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_stats_link.js

echo "-- Verify --"
grep -n 'stats`\|Statistics →' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' | head -5

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
git commit -m "Public: per-season Statistics page (drivers, per-round participation, iRating, race totals)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then:"
echo "  • From admin season page: click 'Statistics →' (next to Pro/Am calculator)"
echo "  • Direct URL:  https://league.simracing-hub.com/leagues/<slug>/seasons/<id>/stats"
echo ""
echo "v1 includes: approved drivers, rounds completed, avg grid size, avg iRating,"
echo "per-round participation bar chart, Pro/Am breakdown, iRating min/avg/max,"
echo "race totals (entries / laps / incidents), team count."
echo ""
echo "If anything's missing or you want different visualisations, tell me what"
echo "and I'll iterate."
