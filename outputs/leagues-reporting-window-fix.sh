#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/page.tsx'

echo "=== Replace /leagues page reporting filter ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Replace the recentRounds query to include scoringSystem and use proper
// time-window math (now within [startsAt + cooldown, startsAt + cooldown + window]).
s = s.replace(
  /const since = new Date\(Date\.now\(\) - 14 \* 24 \* 60 \* 60 \* 1000\);\s*\n\s*const recentRounds = await prisma\.round\.findMany\(\{\s*\n\s*where: \{\s*\n\s*status: \"COMPLETED\",\s*\n\s*startsAt: \{ gte: since \},\s*\n\s*\},\s*\n\s*include: \{ season: \{ include: \{ league: true \} \} \},\s*\n\s*orderBy: \{ startsAt: \"desc\" \},\s*\n\s*take: 30,\s*\n\s*\}\);/,
  \`const now = new Date();
  const candidateRounds = await prisma.round.findMany({
    where: {
      status: \"COMPLETED\",
      season: {
        scoringSystem: {
          protestCooldownHours: { not: null },
          protestWindowHours: { not: null },
        },
      },
    },
    include: {
      season: { include: { league: true, scoringSystem: true } },
    },
    orderBy: { startsAt: \"desc\" },
    take: 100,
  });
  const recentRounds = candidateRounds.filter((r) => {
    const cd = r.season.scoringSystem?.protestCooldownHours;
    const wn = r.season.scoringSystem?.protestWindowHours;
    if (cd == null || wn == null) return false;
    const opensAt = new Date(r.startsAt.getTime() + cd * 3600 * 1000);
    const closesAt = new Date(opensAt.getTime() + wn * 3600 * 1000);
    return now >= opensAt && now < closesAt;
  });\`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'candidateRounds\|recentRounds\|protestCooldownHours\|protestWindowHours' "$FILE" | head -10

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
git commit -m "/leagues 'Open for reporting': use scoringSystem cooldown+window instead of 14-day fallback (matches cron logic)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, /leagues should only show rounds where:"
echo "  now is between (startsAt + protestCooldownHours)"
echo "  and    (startsAt + protestCooldownHours + protestWindowHours)"
echo ""
echo "Rounds outside that window — too early OR closed — won't appear."
