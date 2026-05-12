#!/usr/bin/env bash
# Round page podium: gold/silver/bronze cards for the top 3 finishers.
# Single-race rounds: ranked by overall finish position (combined points).
# Multi-race rounds: ranked by aggregated round total, with per-race chips.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components

cat > src/components/RoundPodium.tsx <<'EOF'
import React from "react";

type PodiumDriver = {
  rank: number; // 1, 2, 3
  firstName: string | null;
  lastName: string | null;
  startNumber: number | null;
  teamName: string | null;
  carClassName: string | null;
  totalPoints: number;
  raceBreakdown?: { raceNumber: number; finishPosition: number }[];
};

export function RoundPodium({
  drivers,
  isMultiRace,
  isMulticlass,
}: {
  drivers: PodiumDriver[];
  isMultiRace: boolean;
  isMulticlass: boolean;
}) {
  if (drivers.length < 3) return null;
  // Render in ranking order on mobile (1, 2, 3); on >=sm we put 2 / 1 / 3 so
  // the winner sits in the middle with a slight elevation.
  const mobileOrder = drivers.slice(0, 3);
  return (
    <section>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {mobileOrder.map((d) => (
          <PodiumCard
            key={d.rank}
            driver={d}
            isMultiRace={isMultiRace}
            isMulticlass={isMulticlass}
          />
        ))}
      </div>
    </section>
  );
}

function PodiumCard({
  driver,
  isMultiRace,
  isMulticlass,
}: {
  driver: PodiumDriver;
  isMultiRace: boolean;
  isMulticlass: boolean;
}) {
  const r = driver.rank;
  const card =
    r === 1
      ? "border-yellow-500/60 bg-gradient-to-br from-yellow-950/40 to-zinc-950 sm:scale-[1.02] sm:order-2"
      : r === 2
        ? "border-zinc-500/50 bg-gradient-to-br from-zinc-800/40 to-zinc-950 sm:order-1"
        : "border-amber-700/50 bg-gradient-to-br from-amber-950/40 to-zinc-950 sm:order-3";
  const accent =
    r === 1 ? "text-yellow-300" : r === 2 ? "text-zinc-200" : "text-amber-400";
  const label = r === 1 ? "Winner" : r === 2 ? "2nd" : "3rd";

  const name = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();

  return (
    <div className={`relative overflow-hidden rounded-lg border p-4 ${card}`}>
      <div className="flex items-baseline justify-between">
        <span className={`font-display text-3xl font-bold ${accent}`}>
          P{r}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="mt-3">
        <div className="font-display text-base font-bold text-zinc-100">
          {driver.startNumber != null && (
            <span className={`mr-1.5 ${accent}`}>#{driver.startNumber}</span>
          )}
          {name || "—"}
        </div>
        <div className="mt-0.5 text-xs text-zinc-400">
          {driver.teamName ?? "Independent"}
          {isMulticlass && driver.carClassName ? ` • ${driver.carClassName}` : ""}
        </div>
      </div>
      <div className={`mt-3 font-display text-2xl font-bold ${accent}`}>
        {driver.totalPoints} <span className="text-sm font-normal text-zinc-400">pts</span>
      </div>
      {isMultiRace && driver.raceBreakdown && driver.raceBreakdown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {driver.raceBreakdown.map((rb) => (
            <span
              key={rb.raceNumber}
              className="rounded bg-zinc-950/70 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              R{rb.raceNumber}: P{rb.finishPosition}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
EOF
echo "Wrote src/components/RoundPodium.tsx"

# Patch the public round page: import RoundPodium + render it above results
# only on the Combined view (so it doesn't repeat on Race1/Race2/Pro/Am/Team).
mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1) Import the component
const importLine = 'import { formatDateTime } from "@/lib/date";';
const importNew = importLine + '\nimport { RoundPodium } from "@/components/RoundPodium";';
if (!s.includes('from "@/components/RoundPodium"')) {
  if (!s.includes(importLine)) { console.error("import anchor not found"); process.exit(1); }
  s = s.replace(importLine, importNew);
  console.log("Imported RoundPodium.");
}

// 2) Compute podium drivers from aggRows (already in scope, sorted by totalPoints desc).
//    Add this just before the `return (` of the page body.
const computeAnchor = "  return (\n    <div className=\"space-y-6\">";
const computeReplacement =
`  // Top 3 podium for the Combined view. Filter to drivers who have at least
  // one CLASSIFIED race; sort is already done by aggRows (totalPoints desc).
  const podium = aggRows
    .filter((a) => a.rows.some((r) => r.finishStatus === "CLASSIFIED"))
    .slice(0, 3)
    .map((a, i) => {
      const sample = a.rows[0];
      return {
        rank: i + 1,
        firstName: sample.registration.user.firstName,
        lastName: sample.registration.user.lastName,
        startNumber: sample.registration.startNumber,
        teamName: sample.registration.team?.name ?? null,
        carClassName: sample.registration.carClass?.name ?? null,
        totalPoints: a.totalPoints,
        raceBreakdown: [...a.rows]
          .sort((x, y) => x.raceNumber - y.raceNumber)
          .map((r) => ({ raceNumber: r.raceNumber, finishPosition: r.finishPosition })),
      };
    });

  return (
    <div className="space-y-6">`;
if (!s.includes("Top 3 podium for the Combined view")) {
  if (!s.includes(computeAnchor)) { console.error("compute anchor not found"); process.exit(1); }
  s = s.replace(computeAnchor, computeReplacement);
  console.log("Added podium computation.");
}

// 3) Render the podium right after the View toggle + before <section>Race results</section>
//    Anchor on the View toggle's closing </div> followed by the Race results section.
const insertBefore = '      <section>\n        <h2 className="mb-3 text-lg font-semibold">Race results</h2>';
const insertWith =
`      {cls === "combined" && podium.length > 0 && (
        <RoundPodium
          drivers={podium}
          isMultiRace={isMultiRace}
          isMulticlass={isMulticlass}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race results</h2>`;
if (!s.includes('{cls === "combined" && podium.length > 0 && (')) {
  if (!s.includes(insertBefore)) { console.error("Race results section anchor not found"); process.exit(1); }
  s = s.replace(insertBefore, insertWith);
  console.log("Inserted RoundPodium render.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Public round page: podium hero (top 3 finishers) on Combined view"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Each round Combined view shows a 3-card podium at the top."
echo "  - Multi-race rounds also show R1/R2 finish chips per podium driver."
echo "  - Race1, Race2, Pro, Am, Team views unchanged."
