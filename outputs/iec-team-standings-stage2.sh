#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Add computeTeamClassStandings to standings.ts
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("computeTeamClassStandings")) {
  console.log("standings.ts: computeTeamClassStandings already present.");
  process.exit(0);
}

s += `

// ============================================================================
// TEAM CLASS STANDINGS (endurance / IEC)
// Reads TeamResult rows directly. Each carClass is its own championship.
// Points come from scoringSystem.pointsTable[classPosition].
// ============================================================================

export interface TeamClassRoundResult {
  roundId: string;
  roundNumber: number;
  roundName: string;
  finishPosition: number;
  classPosition: number | null;
  points: number;
  totalIncidents: number;
  finishStatus: string;
}

export interface TeamClassStanding {
  teamId: string;
  teamName: string;
  totalPoints: number;
  totalIncidents: number;
  roundsCompleted: number;
  bestClassFinish: number | null;
  rounds: TeamClassRoundResult[];
}

export interface TeamClassGroup {
  carClassId: string;
  carClassName: string;
  carClassShortCode: string;
  teams: TeamClassStanding[];
}

export async function computeTeamClassStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<TeamClassGroup[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { scoringSystem: true },
  });
  if (!season) return [];
  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;

  const results = await prisma.teamResult.findMany({
    where: { round: { seasonId } },
    include: {
      team: { select: { id: true, name: true } },
      carClass: { select: { id: true, name: true, shortCode: true, displayOrder: true } },
      round: { select: { id: true, roundNumber: true, name: true } },
    },
  });

  // Group by carClassId → teamId → rounds
  type Bucket = {
    classId: string;
    className: string;
    classShort: string;
    classOrder: number;
    teams: Map<string, {
      teamName: string;
      total: number;
      incidents: number;
      rounds: TeamClassRoundResult[];
    }>;
  };
  const byClass = new Map<string, Bucket>();
  for (const r of results) {
    if (!r.carClass) continue;
    const cid = r.carClass.id;
    let b = byClass.get(cid);
    if (!b) {
      b = {
        classId: cid,
        className: r.carClass.name,
        classShort: r.carClass.shortCode,
        classOrder: r.carClass.displayOrder ?? 0,
        teams: new Map(),
      };
      byClass.set(cid, b);
    }
    let t = b.teams.get(r.team.id);
    if (!t) {
      t = { teamName: r.team.name, total: 0, incidents: 0, rounds: [] };
      b.teams.set(r.team.id, t);
    }
    const pts = r.classPosition != null ? (pointsTable[String(r.classPosition)] ?? 0) : 0;
    t.total += pts;
    t.incidents += r.totalIncidents;
    t.rounds.push({
      roundId: r.round.id,
      roundNumber: r.round.roundNumber,
      roundName: r.round.name,
      finishPosition: r.finishPosition,
      classPosition: r.classPosition,
      points: pts,
      totalIncidents: r.totalIncidents,
      finishStatus: r.finishStatus,
    });
  }

  const out: TeamClassGroup[] = [];
  for (const b of byClass.values()) {
    const teams: TeamClassStanding[] = [];
    for (const [teamId, t] of b.teams.entries()) {
      const sorted = [...t.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
      const bestClassFinish = sorted
        .map((r) => r.classPosition)
        .filter((x): x is number => x != null)
        .reduce<number | null>((m, x) => (m == null ? x : Math.min(m, x)), null);
      teams.push({
        teamId,
        teamName: t.teamName,
        totalPoints: t.total,
        totalIncidents: t.incidents,
        roundsCompleted: t.rounds.length,
        bestClassFinish,
        rounds: sorted,
      });
    }
    teams.sort((a, b) => b.totalPoints - a.totalPoints || (a.bestClassFinish ?? 999) - (b.bestClassFinish ?? 999));
    out.push({
      carClassId: b.classId,
      carClassName: b.className,
      carClassShortCode: b.classShort,
      teams,
    });
  }
  out.sort((a, b) => {
    // Order classes by their displayOrder via the original Bucket.
    const aOrder = byClass.get(a.carClassId)?.classOrder ?? 0;
    const bOrder = byClass.get(b.carClassId)?.classOrder ?? 0;
    return aOrder - bOrder || a.carClassName.localeCompare(b.carClassName);
  });
  return out;
}
`;
fs.writeFileSync(FILE, s);
console.log("standings.ts: computeTeamClassStandings appended.");
EOF
node outputs-tmp/patch-standings.mjs

# ===========================================================================
# 2. Standings page: load + render team-class view when present
# ===========================================================================
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 2a. Imports
if (!s.includes("computeTeamClassStandings")) {
  s = s.replace(
    `import {
  computeDriverStandings,
  computeTeamStandings,
  computeCarStandings,
  type DriverStanding,
  type TeamStanding,
  type CarStanding,
} from "@/lib/standings";`,
    `import {
  computeDriverStandings,
  computeTeamStandings,
  computeCarStandings,
  computeTeamClassStandings,
  type DriverStanding,
  type TeamStanding,
  type CarStanding,
  type TeamClassGroup,
} from "@/lib/standings";`
  );
}

// 2b. Add teamClasses fetch alongside the others.
if (!s.includes("computeTeamClassStandings(prisma")) {
  s = s.replace(
    `  const [drivers, previousDrivers, teams, cars] = await Promise.all([`,
    `  const [drivers, previousDrivers, teams, cars, teamClasses] = await Promise.all([`
  );
  s = s.replace(
    /computeCarStandings\(prisma, seasonId\),?\n(\s*)\]\);/,
    (m, indent) => `computeCarStandings(prisma, seasonId),\n${indent}computeTeamClassStandings(prisma, seasonId),\n${indent}]);`
  );
}

// 2c. Replace the Team tab render block to show class breakdown when present.
const before = `      {cls === "team" && teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {season.teamScoringMode === "SUM_BEST_N"
              ? \`Best \${season.teamScoringBestN ?? 2} drivers per round\`
              : "Sum of all team drivers' points"}
          </p>
          <TeamsTable rows={teams} />
        </section>
      )}`;

const after = `      {cls === "team" && teamClasses.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
            <p className="mb-2 text-xs text-zinc-500">
              Endurance / team event — points awarded by class position. One championship per car class.
            </p>
          </div>
          {teamClasses.map((g) => (
            <details
              key={g.carClassId}
              open
              className="rounded border border-zinc-800 bg-zinc-900/50"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
                <span className="flex items-center gap-3">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {g.carClassShortCode}
                  </span>
                  <span className="font-display text-base font-semibold">{g.carClassName}</span>
                  <span className="text-xs text-zinc-500">
                    ({g.teams.length} team{g.teams.length === 1 ? "" : "s"})
                  </span>
                </span>
              </summary>
              <div className="border-t border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 w-10">Pos</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2 text-right">Best</th>
                      <th className="px-3 py-2 text-right">Rounds</th>
                      <th className="px-3 py-2 text-right">Incidents</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t, i) => (
                      <tr key={t.teamId} className="border-t border-zinc-800">
                        <td className="px-3 py-2 font-medium">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{t.teamName}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">
                          {t.bestClassFinish != null ? "P" + t.bestClassFinish : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.roundsCompleted}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{t.totalIncidents}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )}
      {cls === "team" && teamClasses.length === 0 && teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {season.teamScoringMode === "SUM_BEST_N"
              ? \`Best \${season.teamScoringBestN ?? 2} drivers per round\`
              : "Sum of all team drivers' points"}
          </p>
          <TeamsTable rows={teams} />
        </section>
      )}`;

if (!s.includes("Endurance / team event — points awarded by class position")) {
  if (!s.includes(before)) { console.error("Standings page: Team tab anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

fs.writeFileSync(FILE, s);
console.log("Standings page: per-class team championship wired.");
EOF
node outputs-tmp/patch-standings-page.mjs

# ===========================================================================
# 3. Round detail page: per-class team view when TeamResults exist
# ===========================================================================
cat > outputs-tmp/patch-round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("RoundTeamSection")) {
  console.log("Round page: team section already present.");
  process.exit(0);
}

// 3a. Load team results for the round.
// We hook into the existing prisma round query. Find the prisma.round.findUnique
// in the page (the one for the page itself, not generateMetadata) and add
// teamResults include.
{
  // Add a separate fetch after the round is loaded, at a safe spot.
  // We piggyback on the existing round/season loading path: insert a teamResults fetch
  // right after `const allRows = round.raceResults;`
  s = s.replace(
    `  const allRows = round.raceResults;`,
    `  const allRows = round.raceResults;
  const teamResultsForRound = await prisma.teamResult.findMany({
    where: { roundId: round.id },
    include: {
      team: { select: { id: true, name: true } },
      carClass: { select: { id: true, name: true, shortCode: true, displayOrder: true } },
      participations: {
        include: {
          registration: {
            include: {
              user: { select: { firstName: true, lastName: true, countryCode: true } },
            },
          },
        },
      },
    },
    orderBy: [{ classPosition: "asc" }, { finishPosition: "asc" }],
  });
  const hasTeamData = teamResultsForRound.length > 0;`
  );
}

// 3b. Add a "Teams" tab to the toggle row when hasTeamData.
{
  const before = `        <Link
          href={\`\${baseHref}?cls=car\`}
          className={\`\${pillBase} \${cls === "car" ? pillOn : pillOff}\`}
        >
          By Car
        </Link>`;
  const after = `        <Link
          href={\`\${baseHref}?cls=car\`}
          className={\`\${pillBase} \${cls === "car" ? pillOn : pillOff}\`}
        >
          By Car
        </Link>
        {hasTeamData && (
          <Link
            href={\`\${baseHref}?cls=teams\`}
            className={\`\${pillBase} \${cls === "teams" ? pillOn : pillOff}\`}
          >
            Teams
          </Link>
        )}`;
  if (!s.includes('?cls=teams')) {
    if (!s.includes(before)) { console.error("Round page: By Car anchor not found."); process.exit(1); }
    s = s.replace(before, after);
  }
}

// 3c. Extend Cls type.
if (!s.includes('| "teams"')) {
  s = s.replace(/type Cls = ([^;]+);/, (m, body) => `type Cls = ${body} | "teams";`);
}

// 3d. Extend cls assignment chain.
if (!s.includes('clsRaw === "teams"')) {
  s = s.replace(/:\s*"combined";/, `: clsRaw === "teams" ? "teams" : "combined";`);
}

// 3e. Insert render branch for cls === "teams"
if (!s.includes('cls === "teams" ?')) {
  const before2 = `        ) : cls === "car" ? (`;
  const after2 = `        ) : cls === "teams" ? (
          <RoundTeamSection teamResults={teamResultsForRound} />
        ) : cls === "car" ? (`;
  if (!s.includes(before2)) { console.error("Round page: cls=='car' branch anchor not found."); process.exit(1); }
  s = s.replace(before2, after2);
}

// 3f. Append RoundTeamSection component.
s += `

interface RoundTeamRow {
  id: string;
  finishPosition: number;
  classPosition: number | null;
  lapsCompleted: number;
  totalIncidents: number;
  finishStatus: string;
  team: { id: string; name: string };
  carClass: { id: string; name: string; shortCode: string; displayOrder: number } | null;
  participations: Array<{
    id: string;
    lapsCompleted: number;
    lapsLed: number;
    incidents: number;
    iRating: number | null;
    finishStatus: string;
    registration: {
      user: {
        firstName: string | null;
        lastName: string | null;
        countryCode: string | null;
      };
    };
  }>;
}

function flagFor(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const cps = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...cps);
}

function RoundTeamSection({ teamResults }: { teamResults: RoundTeamRow[] }) {
  // Group by carClassId
  const byClass = new Map<string, { name: string; short: string; order: number; rows: RoundTeamRow[] }>();
  for (const r of teamResults) {
    const cid = r.carClass?.id ?? "__none__";
    if (!byClass.has(cid)) {
      byClass.set(cid, {
        name: r.carClass?.name ?? "Unassigned",
        short: r.carClass?.shortCode ?? "—",
        order: r.carClass?.displayOrder ?? 999,
        rows: [],
      });
    }
    byClass.get(cid)!.rows.push(r);
  }
  const groups = [...byClass.entries()].sort(([, a], [, b]) => a.order - b.order || a.name.localeCompare(b.name));

  return (
    <section className="space-y-4">
      {groups.map(([cid, g]) => (
        <details
          key={cid}
          open
          className="rounded border border-zinc-800 bg-zinc-900/50"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
            <span className="flex items-center gap-3">
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {g.short}
              </span>
              <span className="font-display text-base font-semibold">{g.name}</span>
              <span className="text-xs text-zinc-500">
                ({g.rows.length} team{g.rows.length === 1 ? "" : "s"})
              </span>
            </span>
          </summary>
          <div className="divide-y divide-zinc-800 border-t border-zinc-800">
            {g.rows.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-200">
                      {r.classPosition != null ? "P" + r.classPosition : "—"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Overall P{r.finishPosition}
                    </span>
                    <span className="font-display text-base font-semibold">{r.team.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-400">{r.lapsCompleted} laps</span>
                    <span className="text-zinc-400">{r.totalIncidents} inc</span>
                    {r.finishStatus !== "CLASSIFIED" && (
                      <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                        {r.finishStatus}
                      </span>
                    )}
                  </div>
                </div>
                {r.participations.length > 0 && (
                  <div className="mt-2 ml-1 grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                    {r.participations.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>{flagFor(d.registration.user.countryCode)}</span>
                        <span className="text-zinc-200">
                          {d.registration.user.firstName} {d.registration.user.lastName}
                        </span>
                        <span className="ml-auto text-zinc-500">
                          {d.lapsCompleted}L · {d.incidents}x
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
`;

fs.writeFileSync(FILE, s);
console.log("Round page: Teams view + RoundTeamSection wired.");
EOF
node outputs-tmp/patch-round-page.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "IEC stage 2: per-class team championship on standings + Teams view on round page (with class breakdown + driver stints)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
