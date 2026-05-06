#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Public /leagues — add 'Open for incident reporting' section
# ============================================================================
echo "=== 1. Patch /leagues page ==="
cat > /tmp/lm_leagues_reporting_block.txt <<'JSX'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicLeaguesList() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentRounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      startsAt: { gte: since },
    },
    include: { season: { include: { league: true } } },
    orderBy: { startsAt: "desc" },
    take: 30,
  });

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });

  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { seasons: true } },
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      {recentRounds.length > 0 && (
        <section className="rounded border border-amber-700/50 bg-amber-950/20 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">⚑</span>
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-amber-200">
              Open for incident reporting
            </h2>
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            Recently-completed rounds. Click to file a steward report.
          </p>
          <ul className="space-y-1">
            {recentRounds.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded bg-zinc-900/60 px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-500">{fmtDate(r.startsAt)}</span>
                <span className="text-zinc-400">
                  {r.season.league.name} · {r.season.name} {r.season.year}
                </span>
                <span className="font-medium text-zinc-200">
                  R{r.roundNumber} {r.name}
                </span>
                <Link
                  href={`/leagues/${r.season.league.slug}/seasons/${r.seasonId}/rounds/${r.id}/report`}
                  className="ml-auto rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-500"
                >
                  Report incident →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-1 font-display text-lg font-bold tracking-wide">
          Leagues
        </h1>
      </div>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col items-center gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
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
                <div className="truncate font-display text-[10px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
                  {league.name}
                </div>
                <div className="truncate text-[9px] text-zinc-500">
                  {league._count.seasons} season
                  {league._count.seasons === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
JSX

# Replace the entire file (small file, full rewrite is cleanest)
cp /tmp/lm_leagues_reporting_block.txt src/app/leagues/page.tsx
echo "  Rewritten."

# ============================================================================
# 2. Admin /admin/links — add stewards top-level link + per-season Reports
# ============================================================================
echo ""
echo "=== 2. Patch /admin/links page ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/admin/links/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add Stewards queue to top-level quick links
if (!s.includes('Stewards queue')) {
  s = s.replace(
    /(<LinkRow label=\"Admin dashboard\" url=\\\`\\\${baseUrl}\/admin\\\` \/>)/,
    '\$1\n          <LinkRow label=\"Stewards queue\" url={\\\`\\\${baseUrl}/admin/stewards\\\`} />'
  );
}

// (b) Add Reports link in admin section per season. Anchor on the existing
// 'Cars' link inside each season's admin column.
if (!s.includes('Reports queue')) {
  s = s.replace(
    /<LinkRow\s*\n\s*label=\"Cars\"\s*\n\s*url=\\\`\\\${adminBase}\/cars\\\`\s*\n\s*muted=\{isCompleted\}\s*\n\s*\/>/,
    \`<LinkRow
                          label=\"Cars\"
                          url={\\\`\\\${adminBase}/cars\\\`}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label=\"Reports queue\"
                          url={\\\`\\\${adminBase}/reports\\\`}
                          muted={isCompleted}
                        />\`
  );
}

if (s === before) {
  console.error('  No edits made (anchors did not match).');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 3. Verify
# ============================================================================
echo ""
echo "=== 3. Verify ==="
echo "-- /leagues page --"
grep -n 'Open for incident reporting\|recentRounds' src/app/leagues/page.tsx | head -5
echo ""
echo "-- /admin/links --"
grep -n 'Stewards queue\|Reports queue' src/app/admin/links/page.tsx | head -5

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
git commit -m "Reporting shortcuts: 'Open for incident reporting' frame on /leagues; Stewards + per-season Reports on /admin/links"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  • /leagues — amber 'Open for incident reporting' frame at the top,"
echo "    listing every COMPLETED round from the last 14 days with a direct"
echo "    'Report incident →' button per round."
echo "  • /admin/links — Stewards queue link in the top section, plus a"
echo "    'Reports queue' link in each season's admin column."
