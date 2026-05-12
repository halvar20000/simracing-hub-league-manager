#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ===========================================================================
# 0. Discovery: where do other leagues' schedule posters live?
# ===========================================================================
echo "=== Existing scheduleImageUrl values (so we know the convention) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.season.findMany({
  where: { scheduleImageUrl: { not: null } },
  select: { name: true, scheduleImageUrl: true, league: { select: { slug: true } } },
}).then(rows => {
  for (const r of rows) console.log('  ' + r.league.slug.padEnd(20) + ' / ' + r.name.padEnd(20) + ' → ' + r.scheduleImageUrl);
  if (rows.length === 0) console.log('  (none yet — first one wins)');
  return p.\$disconnect();
});
"
echo ""
echo "=== Existing files under public/posters or public/schedules ==="
find public -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.webp' \) 2>/dev/null \
  | grep -E 'poster|schedule|season' || echo "(no schedule images in public yet)"

echo ""
echo "=== Looking for a CC 8th season schedule image on disk ==="
CANDIDATES=(
  "$HOME/Downloads/cc-8th-schedule.png"
  "$HOME/Downloads/CombinedCup-8th-Schedule.png"
  "$HOME/Downloads/Combined Cup 8th Season.png"
  "$HOME/Nextcloud/AI/league-manager/logos/CombinedCup-8th-Schedule.png"
  "$HOME/Nextcloud/AI/league-manager/logos/cc-8th-schedule.png"
  "$HOME/Nextcloud/AI/league-manager/logos/Combined Cup 8th Season.png"
  "$HOME/Desktop/cc-8th-schedule.png"
)
SCHEDULE_IMG=""
for c in "${CANDIDATES[@]}"; do
  if [ -f "$c" ]; then
    SCHEDULE_IMG="$c"
    echo "  FOUND: $c"
    break
  fi
done
if [ -z "$SCHEDULE_IMG" ]; then
  echo "  (none found — see instructions at end of script output)"
fi

# ===========================================================================
# 1. Create rounds 2 → 15 for CC 8th Season (round 1 already exists)
# ===========================================================================
echo ""
echo "=== Adding rounds 2–15 to CAS Combined Cup 8th Season ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ROUNDS = [
  // [roundNumber, name, track, trackConfig, ISO date 19:00 CEST = 17:00 UTC]
  [2,  'Algarve',                  'Algarve International Circuit', null,            '2025-06-27T17:00:00Z'],
  [3,  'Nürburgring GP',           'Nürburgring',                   'Grand Prix',    '2025-07-04T17:00:00Z'],
  [4,  'Tsukuba 2000',             'Tsukuba Circuit',               '2000 Full',     '2025-07-11T17:00:00Z'],
  [5,  'Laguna Seca',              'WeatherTech Raceway Laguna Seca','Full Course',  '2025-07-18T17:00:00Z'],
  [6,  'Brands Hatch GP',          'Brands Hatch',                  'Grand Prix',    '2025-07-25T17:00:00Z'],
  [7,  'Okayama Short',            'Okayama International Circuit', 'Short',         '2025-08-01T17:00:00Z'],
  [8,  'Monza GP',                 'Autodromo Nazionale Monza',     'Grand Prix',    '2025-08-08T17:00:00Z'],
  [9,  'Zandvoort GP',             'Circuit Zandvoort',             'Grand Prix',    '2025-08-15T17:00:00Z'],
  [10, 'Hockenheim National A',    'Hockenheimring',                'National A',    '2025-08-22T17:00:00Z'],
  [11, 'Road America',             'Road America',                  'Full Course',   '2025-08-29T17:00:00Z'],
  [12, 'Zolder GP',                'Circuit Zolder',                'Grand Prix',    '2025-09-05T17:00:00Z'],
  [13, 'Canadian Tire MoSp Park',  'Canadian Tire Motorsport Park', null,            '2025-09-12T17:00:00Z'],
  [14, 'Mugello GP',               'Mugello Circuit',               'Grand Prix',    '2025-09-19T17:00:00Z'],
  [15, 'Donington Park GP',        'Donington Park',                'Grand Prix',    '2025-09-26T17:00:00Z'],
];

async function main() {
  const season = await p.season.findFirst({
    where: {
      league: { slug: 'cas-combined-cup' },
      OR: [
        { name: { contains: '8th', mode: 'insensitive' } },
        { name: { contains: '8.', mode: 'insensitive' } },
      ],
    },
    include: { league: true, rounds: { select: { roundNumber: true, name: true } } },
  });
  if (!season) {
    console.error('Could not find CAS Combined Cup 8th season. Existing CC seasons:');
    const all = await p.season.findMany({
      where: { league: { slug: 'cas-combined-cup' } },
      select: { id: true, name: true, year: true },
    });
    for (const s of all) console.error('  - ' + s.name + ' (year ' + s.year + ')');
    process.exit(1);
  }
  console.log('Season: ' + season.name + ' (id ' + season.id + ')');
  console.log('Existing rounds: ' + season.rounds.map(r => 'R' + r.roundNumber + ' ' + r.name).join(', '));

  const existingNumbers = new Set(season.rounds.map(r => r.roundNumber));
  let created = 0, skipped = 0;
  for (const [num, name, track, cfg, iso] of ROUNDS) {
    if (existingNumbers.has(num)) {
      console.log('  R' + num + ' ' + name + ' — exists, skipped');
      skipped++;
      continue;
    }
    await p.round.create({
      data: {
        seasonId: season.id,
        roundNumber: num,
        name,
        track,
        trackConfig: cfg,
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
# 2. Schedule image: copy to public/schedule-posters/ + set on season
# ===========================================================================
if [ -n "$SCHEDULE_IMG" ]; then
  echo ""
  echo "=== Installing schedule image ==="
  mkdir -p public/schedule-posters
  EXT="${SCHEDULE_IMG##*.}"
  DEST="public/schedule-posters/cas-combined-cup-8th.${EXT}"
  cp "$SCHEDULE_IMG" "$DEST"
  echo "  Copied $SCHEDULE_IMG → $DEST"

  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.season.updateMany({
    where: {
      league: { slug: 'cas-combined-cup' },
      name: { contains: '8th', mode: 'insensitive' },
    },
    data: { scheduleImageUrl: '/schedule-posters/cas-combined-cup-8th.${EXT}' },
  }).then(r => {
    console.log('  Updated ' + r.count + ' season(s) with scheduleImageUrl.');
    return p.\$disconnect();
  });
  "
else
  echo ""
  echo "=== ⚠ Schedule image not installed ==="
  echo ""
  echo "Save the schedule poster to one of these locations and re-run:"
  echo "  ~/Downloads/cc-8th-schedule.png"
  echo "  ~/Nextcloud/AI/league-manager/logos/CombinedCup-8th-Schedule.png"
  echo ""
  echo "Or open Admin → Combined Cup → 8th Season → Edit and upload it via the form."
fi

# ===========================================================================
# 3. Commit + push
# ===========================================================================
echo ""
git add -A
if git diff --cached --quiet; then
  echo "(no file changes to commit — DB-only updates)"
else
  git commit -m "CC 8th Season: add rounds 2–15 + schedule poster"
  git push
fi
echo ""
echo "Done. Wait ~60s for Vercel."
