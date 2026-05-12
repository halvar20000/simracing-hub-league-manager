#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Remove the misplaced teamResultsForRound block from below allRows
// (where it was originally inserted) — we'll re-insert it earlier.
const teamFetchBlock = `  const allRows = round.raceResults;
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
  const hasTeamData = teamResultsForRound.length > 0;`;

const restored = `  const allRows = round.raceResults;`;

if (s.includes(teamFetchBlock)) {
  s = s.replace(teamFetchBlock, restored);
  console.log("Removed misplaced teamResultsForRound block.");
}

// 2. Hoist the fetch BEFORE the cls assignment.
//    Find the line with `const proAmEnabled = round.season.proAmEnabled;`
//    and insert the fetch block right after it (still before cls).
const hoistAnchor = `  const proAmEnabled = round.season.proAmEnabled;`;
const hoistInsert = `  const proAmEnabled = round.season.proAmEnabled;
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
  const hasTeamData = teamResultsForRound.length > 0;`;

if (!s.includes("const teamResultsForRound = await prisma.teamResult")) {
  if (!s.includes(hoistAnchor)) { console.error("hoist anchor not found."); process.exit(1); }
  s = s.replace(hoistAnchor, hoistInsert);
  console.log("Hoisted teamResultsForRound + hasTeamData above cls assignment.");
} else {
  console.log("teamResultsForRound already in correct position.");
}

// 3. Remove the `finalCls` line we added earlier (it referenced hasTeamData
// before declaration). Now that hasTeamData is hoisted, we can use it inside
// the cls chain itself by changing the fallback.
s = s.replace(
  /\s*\/\/ For team events, force "teams" if user landed without explicit query\.\s*\n\s*const finalCls: Cls = .*?: cls;\n/,
  "\n"
);

// 4. Update the cls chain so the fallback defaults to "teams" when hasTeamData.
const chainBefore = `: clsRaw === "car" ? "car" : "combined";`;
const chainAfter = `: clsRaw === "car" ? "car" : (hasTeamData ? "teams" : "combined");`;
if (s.includes(chainBefore) && !s.includes('hasTeamData ? "teams"')) {
  s = s.replace(chainBefore, chainAfter);
  console.log("cls chain: default → 'teams' when hasTeamData.");
}

// 5. Drop the leftover IEC comment if it exists alone.
s = s.replace(/\n\s*\/\/ IEC: default to teams view when team data exists\.\n/, "\n");

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Show lines 150–185 to confirm order ==="
sed -n '150,185p' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Round page: hoist teamResults fetch above cls assignment; cls defaults to 'teams' when hasTeamData"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
