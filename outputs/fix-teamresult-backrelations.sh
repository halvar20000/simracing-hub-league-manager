#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";

function ensureBackRelation(modelName, fieldLine, label) {
  let s = fs.readFileSync(FILE, "utf8");
  const lines = s.split("\n");
  let inModel = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    const open = new RegExp(`^model\\s+${modelName}\\s*{`).test(lines[i]);
    if (open) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) {
    console.error(`[${label}] Could not find ${modelName} closing brace.`);
    return false;
  }
  // Check if the back-relation is already present in this model body.
  const body = lines.slice(0, close).slice(-200).join("\n"); // last 200 lines of model body
  // Better: scan only the model body lines.
  const inside = lines
    .slice(0, close)
    .reverse()
    .findIndex((l) => new RegExp(`^model\\s+${modelName}\\s*{`).test(l));
  // We already located it via inModel/close. Rebuild from those bounds:
  const start = (() => {
    for (let i = close - 1; i >= 0; i--) {
      if (new RegExp(`^model\\s+${modelName}\\s*{`).test(lines[i])) return i;
    }
    return -1;
  })();
  if (start === -1) {
    console.error(`[${label}] Could not find ${modelName} opening brace.`);
    return false;
  }
  const modelBody = lines.slice(start + 1, close).join("\n");
  if (modelBody.includes(fieldLine.trim())) {
    console.log(`[${label}] ${modelName} already has back-relation.`);
    return false;
  }
  lines.splice(close, 0, fieldLine);
  fs.writeFileSync(FILE, lines.join("\n"));
  console.log(`[${label}] inserted "${fieldLine.trim()}" into ${modelName}.`);
  return true;
}

ensureBackRelation("Round", "  teamResults     TeamResult[]", "Round.teamResults");
ensureBackRelation("Team", "  teamResults    TeamResult[]", "Team.teamResults");
ensureBackRelation("CarClass", "  teamResults   TeamResult[]", "CarClass.teamResults");
ensureBackRelation("Car", "  teamResults   TeamResult[]", "Car.teamResults");
ensureBackRelation("Registration", "  teamRoundDrivers   TeamRoundDriver[]", "Registration.teamRoundDrivers");
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Verify back-relations are present ==="
for model in Round Team CarClass Car Registration; do
  echo "--- $model ---"
  awk -v m="$model" '$0 ~ "^model "m" {" {flag=1} flag {print} /^}/ && flag {flag=0; print ""}' prisma/schema.prisma | grep -E 'teamResults|teamRoundDrivers' || echo "  (no team-related relation found)"
done

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Schema: add missing back-relations on Round/Team/CarClass/Car/Registration for TeamResult + TeamRoundDriver"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
