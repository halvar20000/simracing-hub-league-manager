#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// Idempotency: only act if the cfg vars are NOT yet declared at the top of the function.
if (/const\s+participationPointsAward\s*=/.test(s)) {
  console.log("Cfg vars already declared.");
  process.exit(0);
}

const cfgBefore = `  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;`;
const cfgAfter = `  const pointsTable = (season.scoringSystem.pointsTable ?? {}) as Record<string, number>;
  const participationPointsAward = season.scoringSystem.participationPoints ?? 0;
  const participationMinPct = season.scoringSystem.participationMinDistancePct ?? 75;
  const teamFprEnabled = !!season.scoringSystem.driverFprEnabled;
  const teamFprTiers = teamFprEnabled
    ? readDriverFprTiers(season.scoringSystem.driverFprTiers)
    : [];
  const teamFprMinDistance = season.scoringSystem.driverFprMinDistancePct ?? 90;`;

if (!s.includes(cfgBefore)) {
  console.error("Anchor not found inside computeTeamClassStandings.");
  process.exit(1);
}
s = s.replace(cfgBefore, cfgAfter);
fs.writeFileSync(FILE, s);
console.log("Cfg vars inserted at top of computeTeamClassStandings.");
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Show declared vars (sanity) ==="
grep -n -E "participationPointsAward|participationMinPct|teamFprEnabled|teamFprTiers|teamFprMinDistance" src/lib/standings.ts | head -20

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Standings: declare team participation/FPR cfg vars (was missed by previous patch's idempotency guard)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
