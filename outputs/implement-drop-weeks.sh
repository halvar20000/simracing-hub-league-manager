#!/usr/bin/env bash
# Implement drop-worst-N rounds (drop weeks) per scoring system.
#  GT4 Masters = 1, SFL Cup = 1, GT3 WCT = 3, IEC = null.
# Updates standings library + standings page UI, then recomputes.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) Configure dropWorstNRounds on each scoring system
# ---------------------------------------------------------------
mkdir -p scripts
cat > scripts/configure-drop-weeks.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const CONFIG: { name: string; n: number | null }[] = [
  { name: "CAS GT4 Masters", n: 1    },
  { name: "CAS SFL Cup",     n: 1    },
  { name: "CAS GT3 WCT",     n: 3    },
  { name: "CAS IEC",         n: null },
];

async function main() {
  for (const c of CONFIG) {
    const ss = await prisma.scoringSystem.findUnique({ where: { name: c.name } });
    if (!ss) { console.log(`(skip) ${c.name} not found`); continue; }
    if (ss.dropWorstNRounds === c.n) {
      console.log(`${c.name}: already ${c.n}`);
      continue;
    }
    await prisma.scoringSystem.update({
      where: { id: ss.id },
      data: { dropWorstNRounds: c.n },
    });
    console.log(`${c.name}: dropWorstNRounds ${ss.dropWorstNRounds} -> ${c.n}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
echo "=== Step 1: configure dropWorstNRounds per scoring system ==="
npx tsx scripts/configure-drop-weeks.ts

# ---------------------------------------------------------------
# 2) Patch standings.ts — add dropped flag, drop logic, totals
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Add `dropped: boolean` to RoundPoints interface
if (!/dropped: boolean;/.test(s)) {
  const ifaceAnchor = "hasResult: boolean;";
  const ifaceReplace = "hasResult: boolean;\n  dropped: boolean;          // true when this round is one of the worst-N drop weeks";
  if (!s.includes(ifaceAnchor)) {
    console.error("RoundPoints interface anchor not found.");
    process.exit(1);
  }
  s = s.replace(ifaceAnchor, ifaceReplace);
  console.log("Added 'dropped' to RoundPoints interface.");
}

// (b) Add `dropped: false` to the no-result return inside rounds.map
const noResultBefore = "          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,\n        };";
const noResultAfter = "          combinedPoints: 0,\n          classPoints: 0,\n          hasResult: false,\n          dropped: false,\n        };";
if (!s.includes(noResultAfter)) {
  if (!s.includes(noResultBefore)) {
    console.error("No-result return anchor not found.");
    process.exit(1);
  }
  s = s.replace(noResultBefore, noResultAfter);
  console.log("Added 'dropped: false' to no-result branch.");
}

// (c) Add `dropped: false` to the with-result return inside rounds.map
const withResultBefore = "        combinedPoints: rRaw + rPart - rPen,\n        classPoints: rClassRaw + rPart - rPen,\n        hasResult: true,\n      };";
const withResultAfter = "        combinedPoints: rRaw + rPart - rPen,\n        classPoints: rClassRaw + rPart - rPen,\n        hasResult: true,\n        dropped: false,\n      };";
if (!s.includes(withResultAfter)) {
  if (!s.includes(withResultBefore)) {
    console.error("With-result return anchor not found.");
    process.exit(1);
  }
  s = s.replace(withResultBefore, withResultAfter);
  console.log("Added 'dropped: false' to with-result branch.");
}

// (d) Insert drop logic after roundPoints map, before the outer return.
//     We anchor on the line that closes rounds.map and the next return.
const dropAnchor =
`    });

    return {
      registrationId: reg.id,`;
const dropInjection =
`    });

    // --- Drop worst N rounds (per ScoringSystem.dropWorstNRounds) ---
    const dropN = season.scoringSystem.dropWorstNRounds ?? 0;
    if (dropN > 0) {
      const eligible = roundPoints.filter((rp) => rp.hasResult);
      if (eligible.length > dropN) {
        const sorted = [...eligible].sort(
          (a, b) => a.combinedPoints - b.combinedPoints
        );
        const droppedIds = new Set(
          sorted.slice(0, dropN).map((rp) => rp.roundId)
        );
        for (const rp of roundPoints) {
          if (droppedIds.has(rp.roundId)) {
            rp.dropped = true;
            raw -= rp.rawPoints;
            classRaw -= rp.classRawPoints;
            participation -= rp.participationPoints;
            penalty -= rp.penaltyPoints;
          }
        }
      }
    }

    return {
      registrationId: reg.id,`;
if (s.includes("// --- Drop worst N rounds")) {
  console.log("Drop logic already present.");
} else {
  if (!s.includes(dropAnchor)) {
    console.error("Could not find drop-logic anchor (closing rounds.map + outer return).");
    process.exit(1);
  }
  s = s.replace(dropAnchor, dropInjection);
  console.log("Inserted drop-week logic before outer return.");
}

fs.writeFileSync(FILE, s);
EOF
echo ""
echo "=== Step 2: patch standings.ts ==="
node outputs-tmp/patch-standings.mjs

# ---------------------------------------------------------------
# 3) Patch standings page — strikethrough on dropped round cells
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings-ui.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// In the race-by-race table, each round renders 4 sub-cells (Total / R / B / P)
// for each `rp` of `roundPoints`. We add `${rp.dropped ? " line-through opacity-60" : ""}`
// to the className of each of those 4 td's.
//
// We anchor on the most distinctive class strings that appear in those td's
// and append a conditional className.

const replacements = [
  // Total cell (bordered)
  {
    from: '<td className="border-l border-zinc-800 px-1.5 py-1.5 text-right tabular-nums">',
    to:   '<td className={`border-l border-zinc-800 px-1.5 py-1.5 text-right tabular-nums${rp.dropped ? " line-through opacity-60" : ""}`}>',
  },
  // R cell (zinc-300)
  {
    from: '<td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-300">',
    to:   '<td className={`px-1.5 py-1.5 text-right tabular-nums text-zinc-300${rp.dropped ? " line-through opacity-60" : ""}`}>',
  },
  // B cell (emerald)
  {
    from: '<td className="px-1.5 py-1.5 text-right tabular-nums text-emerald-400">',
    to:   '<td className={`px-1.5 py-1.5 text-right tabular-nums text-emerald-400${rp.dropped ? " line-through opacity-60" : ""}`}>',
  },
  // P cell (red)
  {
    from: '<td className="px-1.5 py-1.5 text-right tabular-nums text-red-400">',
    to:   '<td className={`px-1.5 py-1.5 text-right tabular-nums text-red-400${rp.dropped ? " line-through opacity-60" : ""}`}>',
  },
];

let changed = 0;
for (const r of replacements) {
  if (s.includes(r.to)) {
    console.log("(already applied)");
    continue;
  }
  if (!s.includes(r.from)) {
    console.warn("standings page: anchor not found for one of the 4 cells — skipping that one.");
    continue;
  }
  s = s.replace(r.from, r.to);
  changed++;
}
console.log(`standings page: ${changed} cell(s) updated with rp.dropped strikethrough.`);

fs.writeFileSync(FILE, s);
EOF
echo ""
echo "=== Step 3: patch standings page UI ==="
node outputs-tmp/patch-standings-ui.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 4) Recompute scoring on all rounds (so DriverStanding rebuilds with drop)
# ---------------------------------------------------------------
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
echo ""
echo "=== Step 4: recompute all rounds ==="
npx tsx scripts/recompute-all-rounds.ts

# ---------------------------------------------------------------
# 5) Commit and push
# ---------------------------------------------------------------
echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Drop weeks: configure per scoring system + drop worst N rounds in standings"
git push

echo ""
echo "Done. After Vercel redeploys:"
echo "  - GT4 / SFL standings: each driver's single worst round shows strikethrough,"
echo "    and its race + participation + penalty are excluded from season total."
echo "  - GT3 WCT: same, but for the worst 3 rounds."
echo "  - IEC: no drop applied."
