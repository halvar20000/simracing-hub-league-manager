#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Simplify team-collision check (no include, teammate via separate query) ==="
cat > /tmp/lm_simplify_team_check.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Replace the patched block we just inserted with a simpler form.
const re = /\/\/ ---------- find or create Team ----------\s*\n\s*let team = await prisma\.team\.findFirst\(\{\s*\n\s*where: \{ seasonId, name: teamName \},\s*\n\s*include: \{ registrations: \{ select: \{ userId: true \} \} \},\s*\n\s*\}\);\s*\n\s*\n\s*if \(team\) \{[\s\S]*?\} else \{\s*\n\s*team = await prisma\.team\.create\(\{\s*\n\s*data: \{ seasonId, name: teamName, leaderUserId: leader!\.id \},\s*\n\s*\}\);\s*\n\s*\}/;

if (!re.test(s)) {
  console.error('  Anchor not found.');
  process.exit(1);
}

s = s.replace(re, `// ---------- find or create Team ----------
  let team = await prisma.team.findFirst({
    where: { seasonId, name: teamName },
  });

  if (team) {
    if (team.leaderUserId !== leader!.id) {
      const teammate = await prisma.registration.findFirst({
        where: { teamId: team.id, userId: leader!.id },
        select: { id: true },
      });
      if (teammate) {
        errBack(
          "This team is already registered. Ask the team leader to update the lineup via Manage Team."
        );
      } else {
        errBack(
          \`Team name "\${teamName}" is already registered for this season. Pick a different name.\`
        );
      }
    }
  }
  if (!team) {
    team = await prisma.team.create({
      data: { seasonId, name: teamName, leaderUserId: leader!.id },
    });
  }`);

if (s === before) {
  console.error('  No edit made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_simplify_team_check.js

echo ""
echo "-- Verify --"
grep -n 'find or create Team\|errBack(\|prisma.team.findFirst' src/lib/actions/registrations.ts | head -10

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Team collision check: drop include, query registrations separately to avoid union-type complications"
git push

echo ""
echo "Done."
