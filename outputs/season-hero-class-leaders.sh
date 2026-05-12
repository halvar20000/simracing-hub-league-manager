#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. SeasonHero — add `classLeaders` prop + alternate render
# ===========================================================================
cat > outputs-tmp/patch-hero.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/SeasonHero.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1a. Add classLeaders to the prop type.
if (!s.includes("classLeaders?:")) {
  s = s.replace(
    `  registrationOpen: boolean;
  hasResults: boolean;
};`,
    `  registrationOpen: boolean;
  hasResults: boolean;
  classLeaders?: Array<{
    shortCode: string;
    className: string;
    teamName: string;
    points: number;
  }> | null;
};`
  );
}

// 1b. Replace the "Current Leader" card body with a conditional that prefers classLeaders.
const before = `          {/* Current Leader */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Current Leader
            </div>
            {p.currentLeader && leaderName ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.currentLeader.startNumber != null && (
                    <span className="mr-1.5 text-[#ff6b35]">
                      #{p.currentLeader.startNumber}
                    </span>
                  )}
                  {leaderName}
                </div>
                <div className="text-xs text-zinc-400">
                  {p.currentLeader.points} pts
                  {p.currentLeader.teamName
                    ? \` • \${p.currentLeader.teamName}\`
                    : ""}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-500">
                {p.hasResults ? "—" : "No results yet"}
              </div>
            )}
          </div>`;

const after = `          {/* Class Leaders (team event) — falls back to driver leader otherwise */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              {p.classLeaders && p.classLeaders.length > 0 ? "Class Leaders" : "Current Leader"}
            </div>
            {p.classLeaders && p.classLeaders.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {p.classLeaders.map((cl) => (
                  <li key={cl.shortCode} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-baseline gap-1.5">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">
                        {cl.shortCode}
                      </span>
                      <span className="font-medium text-zinc-100 truncate">{cl.teamName}</span>
                    </span>
                    <span className="text-xs text-zinc-400 tabular-nums">{cl.points} pts</span>
                  </li>
                ))}
              </ul>
            ) : p.currentLeader && leaderName ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.currentLeader.startNumber != null && (
                    <span className="mr-1.5 text-[#ff6b35]">
                      #{p.currentLeader.startNumber}
                    </span>
                  )}
                  {leaderName}
                </div>
                <div className="text-xs text-zinc-400">
                  {p.currentLeader.points} pts
                  {p.currentLeader.teamName
                    ? \` • \${p.currentLeader.teamName}\`
                    : ""}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-500">
                {p.hasResults ? "—" : "No results yet"}
              </div>
            )}
          </div>`;

if (s.includes("Class Leaders")) {
  console.log("SeasonHero: classLeaders already wired.");
} else if (!s.includes(before)) {
  console.error("SeasonHero: Current Leader anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  console.log("SeasonHero: classLeaders rendering wired.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-hero.mjs

# ===========================================================================
# 2. Season page — compute classLeaders from teamClasses + pass to hero
# ===========================================================================
cat > outputs-tmp/patch-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 2a. Build classLeaders from teamClasses next to the existing computation.
if (!s.includes("const classLeaders =")) {
  s = s.replace(
    `  const teamClasses = await computeTeamClassStandings(prisma, seasonId);
  const isTeamEventSeason = teamClasses.length > 0;`,
    `  const teamClasses = await computeTeamClassStandings(prisma, seasonId);
  const isTeamEventSeason = teamClasses.length > 0;
  const classLeaders = isTeamEventSeason
    ? teamClasses
        .map((g) => {
          const top = g.teams[0];
          return top
            ? {
                shortCode: g.carClassShortCode,
                className: g.carClassName,
                teamName: top.teamName,
                points: top.totalPoints,
              }
            : null;
        })
        .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null)
    : null;`
  );
}

// 2b. Pass classLeaders to the SeasonHero AND null-out currentLeader for team events.
//     Find the existing currentLeader prop on SeasonHero and replace it.
if (!s.includes("classLeaders={classLeaders}")) {
  s = s.replace(
    `        currentLeader={currentLeader}`,
    `        currentLeader={isTeamEventSeason ? null : currentLeader}
        classLeaders={classLeaders}`
  );
}

fs.writeFileSync(FILE, s);
console.log("Season page: classLeaders + null currentLeader for IEC wired.");
EOF
node outputs-tmp/patch-page.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "SeasonHero: show class leaders (team-by-class) instead of single driver leader for team events"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
