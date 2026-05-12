#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("// --- team participation + fpr (computed) ---")) {
  console.log("Already patched.");
  process.exit(0);
}

// Replace the per-result point calculation in computeTeamClassStandings.
const before = `    const basePts =
      r.classPosition != null ? pointsTable[String(r.classPosition)] ?? 0 : 0;
    const stored = r.rawPointsAwarded ?? 0;
    const racePts = stored > 0 ? stored : basePts;
    const participation = r.participationPointsAwarded ?? 0;
    const correction = r.correctionPoints ?? 0;
    const penalty = r.manualPenaltyPoints ?? 0;
    const pts = racePts + participation + correction - penalty;
    t.total += pts;
    t.incidents += r.totalIncidents;`;

const after = `    const basePts =
      r.classPosition != null ? pointsTable[String(r.classPosition)] ?? 0 : 0;
    const stored = r.rawPointsAwarded ?? 0;
    const racePts = stored > 0 ? stored : basePts;

    // --- team participation + fpr (computed) ---
    const participationStored = r.participationPointsAwarded ?? 0;
    let participation = participationStored;
    if (participation === 0 && (r.raceDistancePct ?? 0) >= participationMinPct) {
      participation = participationPointsAward;
    }

    let fprPoints = 0;
    if (teamFprEnabled && (r.raceDistancePct ?? 0) >= teamFprMinDistance) {
      fprPoints = fprPointsForIncidents(r.totalIncidents ?? 0, teamFprTiers);
    }

    const correction = r.correctionPoints ?? 0;
    const penalty = r.manualPenaltyPoints ?? 0;
    const pts = racePts + participation + correction - penalty + fprPoints;
    t.total += pts;
    t.incidents += r.totalIncidents;`;

if (!s.includes(before)) { console.error("Anchor not found in computeTeamClassStandings."); process.exit(1); }
s = s.replace(before, after);

// Also pull the configuration values up-front. Insert just after pointsTable
// is read inside computeTeamClassStandings.
const cfgBefore = `  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;`;
const cfgAfter = `  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;
  const participationPointsAward = season.scoringSystem.participationPoints ?? 0;
  const participationMinPct = season.scoringSystem.participationMinDistancePct ?? 75;
  const teamFprEnabled = !!season.scoringSystem.driverFprEnabled;
  const teamFprTiers = teamFprEnabled
    ? readDriverFprTiers(season.scoringSystem.driverFprTiers)
    : [];
  const teamFprMinDistance = season.scoringSystem.driverFprMinDistancePct ?? 90;`;

if (!s.includes("participationPointsAward")) {
  if (!s.includes(cfgBefore)) { console.error("pointsTable anchor in computeTeamClassStandings not found."); process.exit(1); }
  s = s.replace(cfgBefore, cfgAfter);
}

fs.writeFileSync(FILE, s);
console.log("Standings: team participation + FPR added to per-class points.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Team class standings: include team participation points (per round, distance-gated) + driver-FPR-tier as team FPR (incidents-based)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
