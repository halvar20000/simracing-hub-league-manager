#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ===========================================================================
# 1. Make sure CC 8th is deleted (idempotent)
# ===========================================================================
echo "=== Cleanup: drop CC 8th if still present ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.season.deleteMany({
  where: { league: { slug: 'cas-combined-cup' }, name: { contains: '8th', mode: 'insensitive' } },
}).then(r => {
  console.log('  Deleted ' + r.count + ' season(s).');
  return p.\$disconnect();
});
"

# ===========================================================================
# 2. Ensure CC 10th Season exists (multiclass, OPEN_REGISTRATION)
# ===========================================================================
echo ""
echo "=== Ensuring CC 10th Season ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const league = await p.league.findUnique({ where: { slug: 'cas-combined-cup' } });
  if (!league) { console.error('CC league not found.'); process.exit(1); }

  let ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'Combined', mode: 'insensitive' } } });
  if (!ss) ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'SFL', mode: 'insensitive' } } });
  if (!ss) { console.error('No scoring system available.'); process.exit(1); }

  let s = await p.season.findFirst({
    where: { leagueId: league.id, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!s) {
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
    console.log('  Created: ' + s.name + ' (id ' + s.id + ', scoring=' + ss.name + ')');
  } else {
    console.log('  Already exists: ' + s.name + ' (id ' + s.id + ')');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 3. Install schedule poster
# ===========================================================================
echo ""
echo "=== Schedule poster ==="
SRC="logos/CombinedCup-10th-Schedule.png"
if [ -f "$SRC" ]; then
  mkdir -p public/schedule-posters
  DEST="public/schedule-posters/cas-combined-cup-10th.png"
  cp "$SRC" "$DEST"
  echo "  Copied $SRC → $DEST"
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.season.updateMany({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
    data: { scheduleImageUrl: '/schedule-posters/cas-combined-cup-10th.png' },
  }).then(r => { console.log('  Updated scheduleImageUrl on ' + r.count + ' season(s).'); return p.\$disconnect(); });
  "
else
  echo "  ⚠  $SRC not found — skipping image install."
fi

# ===========================================================================
# 4. Seed the 3 car classes (RAY / RAD / TCR) — required for multiclass
# ===========================================================================
echo ""
echo "=== Seeding car classes (RAY / RAD / TCR) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const CLASSES = [
  { shortCode: 'RAY', name: 'Ray FF 1600', displayOrder: 1 },
  { shortCode: 'RAD', name: 'Radical SR 8', displayOrder: 2 },
  { shortCode: 'TCR', name: 'TCR-Klasse',   displayOrder: 3 },
];
async function main() {
  const s = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!s) { console.error('CC 10th not found.'); process.exit(1); }
  for (const c of CLASSES) {
    const existing = await p.carClass.findFirst({ where: { seasonId: s.id, shortCode: c.shortCode } });
    if (existing) { console.log('  ' + c.shortCode + ' — exists'); continue; }
    await p.carClass.create({ data: { seasonId: s.id, ...c } });
    console.log('  ' + c.shortCode + ' (' + c.name + ') — created');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 5. Create the 12 rounds from the poster
# ===========================================================================
echo ""
echo "=== Adding rounds 1–12 from poster ==="
# Times: 19:00 CET = 18:00 UTC (winter)
#        19:00 CEST = 17:00 UTC (summer)
# DST 2026: starts Sun 29 Mar, ends Sun 25 Oct
# So 27.02 / 13.03 / 27.03 are CET (18:00Z); from 10.04 onwards are CEST (17:00Z).

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ROUNDS = [
  // [num, name, track, trackConfig, ISO date]
  [1,  'Oran Park',         'Oran Park Raceway',                'South',         '2026-02-27T18:00:00Z'],
  [2,  'Mount Panorama',    'Mount Panorama Circuit',           null,            '2026-03-13T18:00:00Z'],
  [3,  'Winton',            'Winton Motor Raceway',             'NC',            '2026-03-27T18:00:00Z'],
  [4,  'Suzuka East',       'Suzuka International Racing Course','East',         '2026-04-10T17:00:00Z'],
  [5,  'Oschersleben GP',   'Motorsport Arena Oschersleben',    'Grand Prix',    '2026-04-24T17:00:00Z'],
  [6,  'Nürburgring GP',    'Nürburgring',                       'Grand Prix',    '2026-05-08T17:00:00Z'],
  [7,  'Navarra',           'Circuito de Navarra',              'Medium',        '2026-05-22T17:00:00Z'],
  [8,  'Zandvoort GP',      'Circuit Zandvoort',                'Grand Prix',    '2026-06-05T17:00:00Z'],
  [9,  'Laguna Seca',       'WeatherTech Raceway Laguna Seca',  'Full Course',   '2026-06-19T17:00:00Z'],
  [10, 'Snetterton 200',    'Snetterton Circuit',               '200',           '2026-07-10T17:00:00Z'],
  [11, 'Imola GP',          'Autodromo Enzo e Dino Ferrari',    'Grand Prix',    '2026-07-24T17:00:00Z'],
  [12, 'Barcelona',         'Circuit de Barcelona-Catalunya',   'Grand Prix',    '2026-08-07T17:00:00Z'],
];

async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
    include: { rounds: { select: { roundNumber: true } } },
  });
  if (!season) { console.error('CC 10th not found.'); process.exit(1); }
  const existing = new Set(season.rounds.map(r => r.roundNumber));
  let created = 0, skipped = 0;
  for (const [num, name, track, cfg, iso] of ROUNDS) {
    if (existing.has(num)) {
      console.log('  R' + num + ' ' + name + ' — exists, skipped');
      skipped++;
      continue;
    }
    await p.round.create({
      data: {
        seasonId: season.id,
        roundNumber: num, name, track, trackConfig: cfg,
        startsAt: new Date(iso),
        status: 'UPCOMING',
      },
    });
    console.log('  R' + num + ' ' + name + ' — created (' + iso + ')');
    created++;
  }
  console.log('');
  console.log('Created ' + created + ' new rounds, skipped ' + skipped + ' existing.');
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 6. Commit + push the image
# ===========================================================================
echo ""
git add -A
if git diff --cached --quiet; then
  echo "(no file changes — DB-only updates)"
else
  git commit -m "CC 10th Season: 12 rounds + 3 car classes (RAY/RAD/TCR) + schedule poster"
  git push
fi
echo ""
echo "Done. Open /leagues/cas-combined-cup/seasons/<10th-id> to verify the hero image and rounds."
