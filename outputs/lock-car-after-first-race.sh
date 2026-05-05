#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Registration page: include rounds + use seasonHasStarted in carLocked
# ============================================================================
echo "=== 1. Patch registration page ==="
cat > /tmp/lm_lock_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add `rounds` to the season findUnique include if missing.
//     Anchor on the existing `include: { league: true }` line.
if (!/rounds:\s*\{/.test(s.split('prisma.season.findUnique')[1] ?? '')) {
  s = s.replace(
    /prisma\.season\.findUnique\(\{\s*\n\s*where: \{ id: seasonId \},\s*\n\s*include: \{ league: true \},\s*\n\s*\}\)/,
    `prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: true,
        rounds: {
          where: {
            countsForChampionship: true,
            startsAt: { lte: new Date() },
          },
          take: 1,
          select: { id: true },
        },
      },
    })`
  );
}

// (b) Compute seasonHasStarted and use it in carLocked.
//     Existing line: const carLocked = !!existing?.carId && season.status === "ACTIVE";
s = s.replace(
  /const carLocked = !!existing\?\.carId && season\.status === "ACTIVE";/,
  `const seasonHasStarted = season.rounds.length > 0;
  const carLocked =
    !!existing?.carId &&
    (season.status === "ACTIVE" || seasonHasStarted);`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_lock_page.js

echo "-- Verify --"
grep -n 'seasonHasStarted\|carLocked\|countsForChampionship' 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' | head -10

# ============================================================================
# 2. createRegistration action: same logic on server side
# ============================================================================
echo ""
echo "=== 2. Patch createRegistration action ==="
cat > /tmp/lm_lock_action.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('seasonHasStartedRound')) {
  console.log('  Already patched.');
  process.exit(0);
}

// Existing block we want to harden:
//   if (
//     existing &&
//     existing.carId &&
//     season.status === "ACTIVE" &&
//     existing.carId !== carId
//   ) {
//     redirect(... locked ...)
//   }
s = s.replace(
  /(\s*if \(\s*\n\s*existing &&\s*\n\s*existing\.carId &&\s*\n\s*)season\.status === "ACTIVE"(\s*&&\s*\n\s*existing\.carId !== carId\s*\n\s*\) \{\s*\n\s*redirect\(\s*\n\s*`\/leagues\/\$\{leagueSlug\}\/seasons\/\$\{seasonId\}\/register\?error=Car\+is\+locked\+after\+season\+start`\s*\n\s*\);\s*\n\s*\})/,
  (_match, head, tail) => {
    return `
  const seasonHasStartedRound = await prisma.round.findFirst({
    where: {
      seasonId,
      countsForChampionship: true,
      startsAt: { lte: new Date() },
    },
    select: { id: true },
  });
${head}(season.status === "ACTIVE" || !!seasonHasStartedRound)${tail}`;
  }
);

if (s === before) {
  console.error('  No edits made — anchor for car-lock check did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_lock_action.js

echo "-- Verify --"
grep -n 'seasonHasStartedRound\|locked+after+season+start' src/lib/actions/registrations.ts | head -10

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Registration: lock car selection once any championship round has started, not only when status === ACTIVE"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Lock condition is now:"
echo "  carLocked = existing.carId is set AND ("
echo "    season.status === ACTIVE  OR"
echo "    at least one championship round has startsAt <= now()"
echo "  )"
echo ""
echo "So even if you forget to flip the season to ACTIVE, the moment round 1's"
echo "scheduled start time is reached the car is locked for that registration."
echo "Both the page (read-only display) and the server action (rejects POSTs"
echo "with a different carId) enforce it."
