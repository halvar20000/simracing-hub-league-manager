#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# Rewrite src/lib/league-templates.ts with the actual ScoringSystem field set:
#   bonusPole, bonusFastestLap, bonusMostLapsLed, participationMinDistancePct
# ---------------------------------------------------------------------------
cat > src/lib/league-templates.ts <<'TS'
import type { TeamScoringMode } from "@prisma/client";

/**
 * Season templates — pick a template when creating a new season and the
 * matching ScoringSystem + season flags are pre-filled.
 *
 * The admin can still edit any field on the form before creating, and can
 * always change the ScoringSystem after creation.
 */

export type SeasonTemplateId =
  | "sprint"
  | "endurance"
  | "endurance-pro-am"
  | "team-endurance";

export interface SeasonTemplate {
  id: SeasonTemplateId;
  label: string;
  tagline: string;
  description: string;
  examples: string[];

  // Season flags
  isMulticlass: boolean;
  proAmEnabled: boolean;
  teamScoringMode: TeamScoringMode;
  teamScoringBestN: number | null;

  // Default ScoringSystem to auto-create
  scoringSystem: {
    name: string;
    racesPerRound: number;
    pointsTable: number[];
    pointsTableRace2: number[] | null;
    participationPoints: number;
    participationInCombined: boolean;
    racePointsMinDistancePct: number;
    participationMinDistancePct: number;
    bonusPole: number | null;
    bonusFastestLap: number | null;
    bonusMostLapsLed: number | null;
    dropWorstNRounds: number | null;
  };
}

const SPRINT_R1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_R2 = [30, 25, 20, 15, 12, 10, 8, 6, 4, 2];
const ENDURANCE = [35, 30, 27, 25, 23, 21, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export const SEASON_TEMPLATES: SeasonTemplate[] = [
  {
    id: "sprint",
    label: "Sprint Series (2 races / round)",
    tagline: "Two short races per round, combined results",
    description:
      "Two sprint races per round with separate points tables. Combined standings sum both races. Drop the worst round.",
    examples: ["Combined Cup", "PCCD", "SFL Cup"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Sprint (2 races / round)",
      racesPerRound: 2,
      pointsTable: SPRINT_R1,
      pointsTableRace2: SPRINT_R2,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      participationMinDistancePct: 75,
      bonusPole: 1,
      bonusFastestLap: null,
      bonusMostLapsLed: null,
      dropWorstNRounds: 1,
    },
  },
  {
    id: "endurance",
    label: "Endurance Series (1 long race)",
    tagline: "Single long race per round",
    description:
      "One race per round, F1-style points table, 75% finish bonus. Drop one worst round.",
    examples: ["CAS TSS GT4"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Endurance (1 race / round)",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      participationMinDistancePct: 75,
      bonusPole: 1,
      bonusFastestLap: null,
      bonusMostLapsLed: null,
      dropWorstNRounds: 1,
    },
  },
  {
    id: "endurance-pro-am",
    label: "Endurance with Pro / Am",
    tagline: "Endurance + Pro/Am class split",
    description:
      "Single endurance race per round with Pro/Am class re-ranking. Drop the three worst rounds.",
    examples: ["CAS GT3 WCT"],
    isMulticlass: true,
    proAmEnabled: true,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Endurance Pro/Am",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      participationMinDistancePct: 75,
      bonusPole: 1,
      bonusFastestLap: null,
      bonusMostLapsLed: null,
      dropWorstNRounds: 3,
    },
  },
  {
    id: "team-endurance",
    label: "Team Endurance (IEC-style)",
    tagline: "Long endurance race scored as a team championship",
    description:
      "One long endurance race per round, team scoring with best-N drivers per team. No round drops.",
    examples: ["CAS IEC"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "SUM_BEST_N",
    teamScoringBestN: 4,
    scoringSystem: {
      name: "Team Endurance",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      participationMinDistancePct: 75,
      bonusPole: 1,
      bonusFastestLap: null,
      bonusMostLapsLed: null,
      dropWorstNRounds: null,
    },
  },
];

export function getTemplate(id: string | null | undefined): SeasonTemplate | null {
  if (!id) return null;
  return SEASON_TEMPLATES.find((t) => t.id === id) ?? null;
}
TS

echo "[+] Wrote src/lib/league-templates.ts"

# ---------------------------------------------------------------------------
# Patch the createSeason action: replace the scoringSystem.create data block
# with the correct field names from the schema (bonusPole/bonusFastestLap/
# bonusMostLapsLed/participationMinDistancePct), drop the unknown fields.
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/seasons.ts";
let s = fs.readFileSync(FILE, "utf8");

const before = `    const ss = await prisma.scoringSystem.create({
      data: {
        name: ssName,
        racesPerRound: t.scoringSystem.racesPerRound,
        pointsTable: t.scoringSystem.pointsTable,
        pointsTableRace2: t.scoringSystem.pointsTableRace2 ?? undefined,
        participationPoints: t.scoringSystem.participationPoints,
        participationInCombined: t.scoringSystem.participationInCombined,
        racePointsMinDistancePct: t.scoringSystem.racePointsMinDistancePct,
        qualifyingFastestPolePoints: t.scoringSystem.qualifyingFastestPolePoints,
        fastestRacePoints: t.scoringSystem.fastestRacePoints,
        dropWorstNRounds: t.scoringSystem.dropWorstNRounds,
        dsqPenaltyPoints: t.scoringSystem.dsqPenaltyPoints,
      },
    });`;

const after = `    const ss = await prisma.scoringSystem.create({
      data: {
        name: ssName,
        racesPerRound: t.scoringSystem.racesPerRound,
        pointsTable: t.scoringSystem.pointsTable,
        pointsTableRace2: t.scoringSystem.pointsTableRace2 ?? undefined,
        participationPoints: t.scoringSystem.participationPoints,
        participationInCombined: t.scoringSystem.participationInCombined,
        racePointsMinDistancePct: t.scoringSystem.racePointsMinDistancePct,
        participationMinDistancePct: t.scoringSystem.participationMinDistancePct,
        bonusPole: t.scoringSystem.bonusPole,
        bonusFastestLap: t.scoringSystem.bonusFastestLap,
        bonusMostLapsLed: t.scoringSystem.bonusMostLapsLed,
        dropWorstNRounds: t.scoringSystem.dropWorstNRounds,
      },
    });`;

if (s.includes(after)) {
  console.log("Already patched.");
} else if (!s.includes(before)) {
  console.error("Anchor not found in src/lib/actions/seasons.ts");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Patched scoringSystem.create call.");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

# ---------------------------------------------------------------------------
# Type-check
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# Commit + push
# ---------------------------------------------------------------------------
git add -A
git commit -m "Season templates: align template defaults to actual ScoringSystem fields"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
