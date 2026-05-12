#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ===========================================================================
# 1. Delete the wrongly-created 8th Season (if it exists)
# ===========================================================================
echo "=== Deleting CC 8th Season (if present) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const s = await p.season.findFirst({
    where: {
      league: { slug: 'cas-combined-cup' },
      name: { contains: '8th', mode: 'insensitive' },
    },
    include: {
      _count: { select: { rounds: true, registrations: true } },
    },
  });
  if (!s) { console.log('  (no 8th season found, nothing to delete)'); await p.\$disconnect(); return; }
  console.log('  Found: ' + s.name + ' — ' + s._count.rounds + ' rounds, ' + s._count.registrations + ' registrations.');
  // Cascade: rounds, registrations, etc. all have onDelete: Cascade from the schema.
  await p.season.delete({ where: { id: s.id } });
  console.log('  Deleted.');
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 2. Find or create CC 10th Season
# ===========================================================================
echo ""
echo "=== Ensuring CC 10th Season exists ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const league = await p.league.findUnique({ where: { slug: 'cas-combined-cup' } });
  if (!league) { console.error('CC league not found.'); process.exit(1); }

  // Find a scoring system to attach. Prefer one named 'CAS Combined Cup'.
  let ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'Combined', mode: 'insensitive' } } });
  if (!ss) {
    // Fall back to SFL system as a shape we know works.
    ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'SFL', mode: 'insensitive' } } });
  }
  if (!ss) { console.error('No scoring system available.'); process.exit(1); }

  let s = await p.season.findFirst({
    where: {
      leagueId: league.id,
      name: { contains: '10th', mode: 'insensitive' },
    },
  });
  if (s) {
    console.log('  Already exists: ' + s.name + ' (id ' + s.id + ')');
  } else {
    s = await p.season.create({
      data: {
        leagueId: league.id,
        name: '10th Season',
        year: 2026,
        scoringSystemId: ss.id,
        isMulticlass: true,
        status: 'OPEN_REGISTRATION',
      },
    });
    console.log('  Created: ' + s.name + ' (id ' + s.id + ', scoring: ' + ss.name + ', multiclass=true)');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 3. Install the schedule image
# ===========================================================================
echo ""
echo "=== Installing schedule poster ==="
SRC="logos/CombinedCup-10th-Schedule.png"
if [ ! -f "$SRC" ]; then
  echo "  ⚠  File not found: $SRC"
  echo "     Save the poster to that location and re-run."
else
  mkdir -p public/schedule-posters
  DEST="public/schedule-posters/cas-combined-cup-10th.png"
  cp "$SRC" "$DEST"
  echo "  Copied $SRC → $DEST"

  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.season.updateMany({
    where: {
      league: { slug: 'cas-combined-cup' },
      name: { contains: '10th', mode: 'insensitive' },
    },
    data: { scheduleImageUrl: '/schedule-posters/cas-combined-cup-10th.png' },
  }).then(r => {
    console.log('  Updated ' + r.count + ' season(s) with scheduleImageUrl.');
    return p.\$disconnect();
  });
  "
fi

# ===========================================================================
# 4. Commit + push the image
# ===========================================================================
echo ""
git add -A
if git diff --cached --quiet; then
  echo "(no file changes to commit — DB-only updates so far)"
else
  git commit -m "CC 10th Season: install schedule poster"
  git push
fi
echo ""
echo "Done with the shell. Now waiting for the round list (paste the poster image so I can read off the dates/tracks)."
