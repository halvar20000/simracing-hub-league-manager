#!/usr/bin/env bash
# Push 2 - UI:
#   - standings library: add excludedAt to DriverStanding + populate it
#   - standings page (DriversTable): strikethrough driver row when excludedAt
#   - admin round page (ResultRow): strikethrough driver name in form header
#   - public round page (ResultsTable / TeamView): strikethrough driver name
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ----------------------------------------------------------------
# 1) standings.ts — add excludedAt to interface + populate
# ----------------------------------------------------------------
cat > outputs-tmp/patch-standings-lib.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Interface: add `excludedAt: Date | null;` after iRating field
const ifaceAnchor = "iRating: number | null;\n  roundsCompleted: number;";
const ifaceReplacement =
  "iRating: number | null;\n  excludedAt: Date | null;\n  roundsCompleted: number;";
if (!s.includes("excludedAt: Date | null;")) {
  if (!s.includes(ifaceAnchor)) {
    console.error("Could not find DriverStanding iRating anchor.");
    process.exit(1);
  }
  s = s.replace(ifaceAnchor, ifaceReplacement);
  console.log("standings.ts: added excludedAt to DriverStanding.");
}

// (b) Where the DriverStanding object is constructed, add excludedAt mapping.
//     We anchor on a field that appears in the construction (roundsCompleted)
//     and inject excludedAt right before it. We require `registration` to be
//     in scope at that point — almost always the case for these libraries.
//
//     If the construction loop doesn't have `registration` in scope, this
//     replacement still works because we'll set excludedAt: null and let the
//     caller fill it in. Worst case we land an inert null, which we'll catch.
//
//     We do this idempotently: only inject if `excludedAt:` isn't already
//     present in the construction site.
const ctorAnchor =
  /(\bcombinedTotal:\s*[^,]+,\s*\n\s*classTotal:\s*[^,]+,\s*\n\s*totalIncidents:[\s\S]*?iRating:\s*[^,]+,\s*\n)(\s*roundsCompleted:)/;
if (!/\bexcludedAt:\s*registration\.excludedAt/.test(s)) {
  const m = s.match(ctorAnchor);
  if (m) {
    s = s.replace(
      ctorAnchor,
      "$1      excludedAt: registration.excludedAt ?? null,\n$2"
    );
    console.log("standings.ts: added excludedAt to DriverStanding constructor.");
  } else {
    // Fallback: try a simpler anchor
    const simpleAnchor =
      /iRating:\s*([^,\n]+),\s*\n(\s*)roundsCompleted:/;
    if (simpleAnchor.test(s)) {
      s = s.replace(
        simpleAnchor,
        "iRating: $1,\n$2excludedAt: registration.excludedAt ?? null,\n$2roundsCompleted:"
      );
      console.log("standings.ts: added excludedAt via simple anchor.");
    } else {
      console.error(
        "Could not find DriverStanding constructor — please add excludedAt manually."
      );
      process.exit(1);
    }
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings-lib.mjs

# ----------------------------------------------------------------
# 2) standings page — strikethrough in DriversTable
# ----------------------------------------------------------------
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace the driver name cell to apply line-through when r.excludedAt is set,
// and append a small "Excluded" badge.
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
  console.log("standings page: Excluded badge already present.");
} else if (s.includes(oldCell)) {
  s = s.replace(oldCell, newCell);
  console.log("standings page: strikethrough + Excluded badge applied.");
} else {
  console.error("Could not find driver name cell anchor in standings page.");
  process.exit(1);
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings-page.mjs

# ----------------------------------------------------------------
# 3) admin round page — strikethrough in ResultRow header
# ----------------------------------------------------------------
cat > outputs-tmp/patch-admin-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Add excludedAt to the inline reg type (already widened earlier).
const typeBefore = "carClass: { name: string; shortCode: string } | null;";
const typeAfter =
  "carClass: { name: string; shortCode: string } | null;\n      excludedAt: Date | null;";
if (s.includes("excludedAt: Date | null;")) {
  console.log("admin round page: reg type already has excludedAt.");
} else {
  if (!s.includes(typeBefore)) {
    console.error("Could not find carClass anchor in admin round page reg type.");
    process.exit(1);
  }
  s = s.replace(typeBefore, typeAfter);
  console.log("admin round page: added excludedAt to reg type.");
}

// (b) The driver name in the ResultRow form header looks like:
//        {reg.user.firstName} {reg.user.lastName}
//     Wrap it with a conditional className.
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
  console.log("admin round page: Excluded badge already present.");
} else if (s.includes(headerOld)) {
  s = s.replace(headerOld, headerNew);
  console.log("admin round page: strikethrough + Excluded badge applied.");
} else {
  console.error("Could not find ResultRow header anchor.");
  process.exit(1);
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

// (a) Add excludedAt to the registration type used inside ResultsTable rows.
//     We need to extend the inline type declaration. Anchor: the `team:` line
//     inside ResultsTable's rows registration object. Same anchor for TeamView.
const regTypeOld = "team: { name: string } | null;\n      carClass: { name: string } | null;";
const regTypeNew =
  "team: { name: string } | null;\n      carClass: { name: string } | null;\n      excludedAt: Date | null;";

let replacements = 0;
let i = 0;
while ((i = s.indexOf(regTypeOld, i)) !== -1) {
  // Replace this occurrence only
  s = s.slice(0, i) + regTypeNew + s.slice(i + regTypeOld.length);
  replacements++;
  i += regTypeNew.length;
}
console.log(`public round page: extended ${replacements} reg type(s) with excludedAt.`);

// (b) ResultsTable driver cell — add line-through when excludedAt.
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
if (s.includes('r.registration.excludedAt && (\n                    <span')) {
  console.log("public round page: ResultsTable Excluded badge already present.");
} else if (s.includes(cellOld)) {
  s = s.replace(cellOld, cellNew);
  console.log("public round page: ResultsTable strikethrough applied.");
} else {
  console.warn("Could not find ResultsTable driver cell — leaving alone.");
}

// (c) TeamView driver cell.
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
if (s.includes('r.registration.excludedAt && (\n                        <span')) {
  console.log("public round page: TeamView Excluded badge already present.");
} else if (s.includes(teamCellOld)) {
  s = s.replace(teamCellOld, teamCellNew);
  console.log("public round page: TeamView strikethrough applied.");
} else {
  console.warn("Could not find TeamView driver cell — leaving alone.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-public-round.mjs

rm -rf outputs-tmp

# ----------------------------------------------------------------
# 5) Recompute scoring so DriverStanding rebuilds with excludedAt populated
# ----------------------------------------------------------------
echo ""
echo "=== Recompute scoring (so excluded flag flows through) ==="
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
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, verify:"
echo "  - GT4 TSS S3 standings: Kevin's row name has strikethrough + red 'Excluded' badge."
echo "  - GT4 TSS S3 round 1 public page: same on the results table."
echo "  - GT4 TSS S3 admin round page: form header for Kevin's row has strikethrough."
