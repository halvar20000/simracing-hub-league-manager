#!/usr/bin/env bash
# Push 2 (corrected): UI strikethrough + Excluded badge wherever a driver
# row is shown.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ----------------------------------------------------------------
# 1) standings.ts — add excludedAt to interface + constructor
# ----------------------------------------------------------------
cat > outputs-tmp/patch-standings-lib.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Interface
const ifaceAnchor = "iRating: number | null;\n  roundsCompleted: number;";
const ifaceReplace =
  "iRating: number | null;\n  excludedAt: Date | null;\n  roundsCompleted: number;";
if (!s.includes("excludedAt: Date | null;")) {
  if (!s.includes(ifaceAnchor)) {
    console.error("Could not find DriverStanding interface anchor.");
    process.exit(1);
  }
  s = s.replace(ifaceAnchor, ifaceReplace);
  console.log("standings.ts: interface gains excludedAt.");
}

// (b) Constructor
const ctorAnchor = "iRating,\n      roundsCompleted: reg.raceResults.length,";
const ctorReplace =
  "iRating,\n      excludedAt: reg.excludedAt ?? null,\n      roundsCompleted: reg.raceResults.length,";
if (!s.includes("excludedAt: reg.excludedAt ?? null,")) {
  if (!s.includes(ctorAnchor)) {
    console.error("Could not find DriverStanding constructor anchor.");
    process.exit(1);
  }
  s = s.replace(ctorAnchor, ctorReplace);
  console.log("standings.ts: constructor gains excludedAt.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings-lib.mjs

# ----------------------------------------------------------------
# 2) standings page — strikethrough + Excluded badge in DriversTable
# ----------------------------------------------------------------
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const oldCell = `<td className="px-3 py-2 font-medium">
                  {r.driverFirstName} {r.driverLastName}
                </td>`;
const newCell = `<td className={\`px-3 py-2 font-medium \${r.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}>
                  {r.driverFirstName} {r.driverLastName}
                  {r.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>`;
if (s.includes("Excluded\n                    </span>")) {
  console.log("standings page: badge already present.");
} else if (!s.includes(oldCell)) {
  console.error("Could not find driver name cell anchor in standings page.");
  process.exit(1);
} else {
  s = s.replace(oldCell, newCell);
  console.log("standings page: strikethrough + Excluded badge applied.");
  fs.writeFileSync(FILE, s);
}
EOF
node outputs-tmp/patch-standings-page.mjs

# ----------------------------------------------------------------
# 3) admin round page — strikethrough in ResultRow header
# ----------------------------------------------------------------
cat > outputs-tmp/patch-admin-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Inline reg type — add excludedAt
const typeBefore = "carClass: { name: string; shortCode: string } | null;";
const typeAfter =
  "carClass: { name: string; shortCode: string } | null;\n      excludedAt: Date | null;";
if (s.includes("excludedAt: Date | null;")) {
  console.log("admin round page: reg type already has excludedAt.");
} else {
  if (!s.includes(typeBefore)) {
    console.error("Could not find admin round page carClass anchor.");
    process.exit(1);
  }
  s = s.replace(typeBefore, typeAfter);
  console.log("admin round page: type gains excludedAt.");
}

// (b) ResultRow header — strikethrough + badge
const headerOld = `<span className="font-semibold">
            {reg.startNumber != null && (
              <span className="mr-2 text-zinc-500">#{reg.startNumber}</span>
            )}
            {reg.user.firstName} {reg.user.lastName}
          </span>`;
const headerNew = `<span className={\`font-semibold \${reg.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}>
            {reg.startNumber != null && (
              <span className="mr-2 text-zinc-500 no-underline">#{reg.startNumber}</span>
            )}
            {reg.user.firstName} {reg.user.lastName}
            {reg.excludedAt && (
              <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                Excluded
              </span>
            )}
          </span>`;
if (s.includes("Excluded\n              </span>")) {
  console.log("admin round page: badge already present.");
} else if (!s.includes(headerOld)) {
  console.error("Could not find admin ResultRow header anchor.");
  process.exit(1);
} else {
  s = s.replace(headerOld, headerNew);
  console.log("admin round page: strikethrough + badge applied.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-admin-round.mjs

# ----------------------------------------------------------------
# 4) public round page — strikethrough in ResultsTable + TeamView
# ----------------------------------------------------------------
cat > outputs-tmp/patch-public-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Extend the inline registration type — there are two places (ResultsTable
//     props + TeamView props). Replace both occurrences.
const regTypeOld =
  "team: { name: string } | null;\n      carClass: { name: string } | null;";
const regTypeNew =
  "team: { name: string } | null;\n      carClass: { name: string } | null;\n      excludedAt: Date | null;";
let count = 0;
let i = 0;
while ((i = s.indexOf(regTypeOld, i)) !== -1) {
  s = s.slice(0, i) + regTypeNew + s.slice(i + regTypeOld.length);
  count++;
  i += regTypeNew.length;
}
console.log(`public round page: extended ${count} reg type(s) with excludedAt.`);

// (b) ResultsTable driver cell
const cellOld = `<td className="px-3 py-2">
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}
                </td>`;
const cellNew = `<td className={\`px-3 py-2 \${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}>
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}
                  {r.registration.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>`;
if (s.includes("r.registration.excludedAt && (\n                    <span")) {
  console.log("public round page: ResultsTable badge already present.");
} else if (s.includes(cellOld)) {
  s = s.replace(cellOld, cellNew);
  console.log("public round page: ResultsTable strikethrough applied.");
} else {
  console.warn("public round page: could not find ResultsTable cell — skipping.");
}

// (c) TeamView driver cell
const teamCellOld = `<td className="px-3 py-1.5">
                      {r.registration.user.firstName}{" "}
                      {r.registration.user.lastName}
                    </td>`;
const teamCellNew = `<td className={\`px-3 py-1.5 \${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}>
                      {r.registration.user.firstName}{" "}
                      {r.registration.user.lastName}
                      {r.registration.excludedAt && (
                        <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                          Excluded
                        </span>
                      )}
                    </td>`;
if (s.includes("r.registration.excludedAt && (\n                        <span")) {
  console.log("public round page: TeamView badge already present.");
} else if (s.includes(teamCellOld)) {
  s = s.replace(teamCellOld, teamCellNew);
  console.log("public round page: TeamView strikethrough applied.");
} else {
  console.warn("public round page: could not find TeamView cell — skipping.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-public-round.mjs

rm -rf outputs-tmp

# ----------------------------------------------------------------
# 5) Recompute scoring so cached DriverStanding rebuilds with excludedAt
# ----------------------------------------------------------------
echo ""
echo "=== Recompute scoring on every round with results ==="
mkdir -p scripts
cat > scripts/recompute-all-rounds.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";
async function main() {
  const rounds = await prisma.round.findMany({
    where: { raceResults: { some: {} } },
    select: { id: true, roundNumber: true, season: { select: { name: true, league: { select: { slug: true } } } } },
    orderBy: [{ season: { league: { slug: "asc" } } }, { season: { name: "asc" } }, { roundNumber: "asc" }],
  });
  for (const r of rounds) {
    await recomputeRoundScoring(prisma, r.id);
    console.log(`Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "UI: strikethrough + Excluded badge for drivers with excludedAt"
git push

echo ""
echo "Done. After Vercel redeploys (~60s), verify Kevin's row on:"
echo "  - GT4 TSS S3 standings"
echo "  - GT4 TSS S3 round 1 public page (ResultsTable + Team view)"
echo "  - GT4 TSS S3 admin round page (form header)"
