#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Patch createTeamRegistration: reject collisions, allow leader update ==="
cat > /tmp/lm_patch_team_collision.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('Ask the team leader to update via Manage Team')) {
  console.log('  Already patched.');
  process.exit(0);
}

// Match the existing find-or-create team block in createTeamRegistration
const re = /\/\/ ---------- find or create Team ----------\s*\n\s*let team = await prisma\.team\.findFirst\(\{\s*\n\s*where: \{ seasonId, name: teamName \},\s*\n\s*\}\);\s*\n\s*if \(!team\) \{\s*\n\s*team = await prisma\.team\.create\(\{\s*\n\s*data: \{ seasonId, name: teamName, leaderUserId: leader!\.id \},\s*\n\s*\}\);\s*\n\s*\}/;

if (!re.test(s)) {
  console.error('  Anchor not found — find-or-create Team block has changed.');
  process.exit(1);
}

s = s.replace(re, `// ---------- find or create Team ----------
  let team = await prisma.team.findFirst({
    where: { seasonId, name: teamName },
    include: { registrations: { select: { userId: true } } },
  });

  if (team) {
    // Same-season team name collision. Three cases:
    //   1) Current user IS the existing leader → fall through (treat as update)
    //   2) Current user was a teammate already → tell them to use Manage Team
    //   3) Otherwise → name belongs to someone else's team
    if (team.leaderUserId !== leader!.id) {
      const isTeammate = team.registrations.some(
        (r) => r.userId === leader!.id
      );
      if (isTeammate) {
        errBack(
          "This team is already registered. Ask the team leader to update the lineup via Manage Team."
        );
      } else {
        errBack(
          \`Team name "\${teamName}" is already registered for this season. Pick a different name.\`
        );
      }
    }
  } else {
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
node /tmp/lm_patch_team_collision.js

echo ""
echo "-- Verify --"
grep -n 'find or create Team\|Ask the team leader\|already registered for this season' src/lib/actions/registrations.ts | head -10

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
git commit -m "createTeamRegistration: reject duplicate team names by other users, allow same-name resubmit only by the existing team leader"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Three behaviours after deploy when leader submits a team name:"
echo "  • Name is unused                → new team created (current user = leader)"
echo "  • Name belongs to another team  → error 'Team name X is already"
echo "                                    registered. Pick a different name.'"
echo "  • Name belongs to a team where  → error 'Ask the team leader to update"
echo "    you're a teammate (not lead)    via Manage Team.'"
echo "  • Name belongs to your own team → upsert flows through as before"
echo "                                    (effectively an update — same as"
echo "                                    /teams/<id>/manage)"
