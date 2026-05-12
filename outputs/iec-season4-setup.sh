#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

POSTER_DIR="CAS_Leagues/IEC/Season 4"

echo "=== Files in poster folder ==="
ls -la "$POSTER_DIR" 2>/dev/null || echo "(folder missing)"

# 1. Find the schedule poster (any png/jpg/webp in the folder)
SCHEDULE_IMG=""
if [ -d "$POSTER_DIR" ]; then
  while IFS= read -r f; do
    SCHEDULE_IMG="$f"
    break
  done < <(find "$POSTER_DIR" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) 2>/dev/null)
fi
echo ""
echo "Found poster: ${SCHEDULE_IMG:-(none)}"

# ===========================================================================
# 2. Create season + classes + rounds
# ===========================================================================
echo ""
echo "=== Creating Season 4 ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Race start 17:30 local — DST 2026 ends Sun 25 Oct, DST 2027 starts Sun 28 Mar.
// So Sep & Oct 3 → CEST (15:30Z). Oct 31 onwards → CET (16:30Z).
const SCHEDULE = [
  [1, '3h Sebring',           'Sebring International Raceway',                 'International',     '2026-09-05T15:30:00Z'],
  [2, '3h Fuji',              'Fuji International Speedway',                   'Grand Prix',        '2026-10-03T15:30:00Z'],
  [3, '3h Le Mans',           'Circuit de la Sarthe',                          '24 Heures du Mans', '2026-10-31T16:30:00Z'],
  [4, '3h Road Atlanta',      'Michelin Raceway Road Atlanta',                 'Full Course',       '2026-11-28T16:30:00Z'],
  [5, '3h Nürburgring GP',    'Nürburgring',                                    'Grand Prix BES/WEC','2027-01-23T16:30:00Z'],
  [6, '3h Daytona',           'Daytona International Speedway',                'Road Course',       '2027-03-06T16:30:00Z'],
];

const CLASSES = [
  { shortCode: 'LMP2',     name: 'LMP2',        displayOrder: 1 },
  { shortCode: 'GT3',      name: 'GT3',         displayOrder: 2, iracingCarClassIds: [4091, 2708] },
  { shortCode: 'PCUP',     name: 'Porsche Cup', displayOrder: 3 },
];

async function main() {
  const league = await p.league.findUnique({ where: { slug: 'cas-iec' } });
  if (!league) { console.error('cas-iec league not found.'); process.exit(1); }

  // Use existing CAS IEC scoring system
  let ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'IEC', mode: 'insensitive' } } });
  if (!ss) { console.error('CAS IEC scoring system not found.'); process.exit(1); }
  console.log('Scoring system: ' + ss.name);

  // Find or create the season
  let season = await p.season.findFirst({
    where: { leagueId: league.id, OR: [{ name: { contains: 'Season 4', mode: 'insensitive' } }, { name: { contains: '4th', mode: 'insensitive' } }] },
  });
  if (!season) {
    season = await p.season.create({
      data: {
        leagueId: league.id,
        name: 'Season 4',
        year: 2026,
        scoringSystemId: ss.id,
        isMulticlass: true,
        proAmEnabled: false,
        teamScoringMode: 'SUM_ALL',
        teamScoringBestN: null,
        status: 'OPEN_REGISTRATION',
        startsOn: new Date('2026-09-05T00:00:00Z'),
        endsOn: new Date('2027-03-06T23:59:59Z'),
      },
    });
    console.log('Created Season 4 (id ' + season.id + ')');
  } else {
    console.log('Season already exists: ' + season.name + ' (id ' + season.id + ')');
  }

  // Car classes
  for (const c of CLASSES) {
    const existing = await p.carClass.findFirst({ where: { seasonId: season.id, shortCode: c.shortCode } });
    if (existing) { console.log('  CarClass ' + c.shortCode + ' — exists'); continue; }
    await p.carClass.create({
      data: {
        seasonId: season.id,
        name: c.name,
        shortCode: c.shortCode,
        displayOrder: c.displayOrder,
        iracingCarClassIds: c.iracingCarClassIds ?? [],
      },
    });
    console.log('  CarClass ' + c.shortCode + ' (' + c.name + ') — created');
  }

  // Rounds
  for (const [num, name, track, cfg, iso] of SCHEDULE) {
    const existing = await p.round.findFirst({ where: { seasonId: season.id, roundNumber: num } });
    if (existing) { console.log('  R' + num + ' ' + name + ' — exists'); continue; }
    await p.round.create({
      data: {
        seasonId: season.id,
        roundNumber: num,
        name, track, trackConfig: cfg,
        startsAt: new Date(iso),
        status: 'UPCOMING',
        raceLengthMinutes: 180,
      },
    });
    console.log('  R' + num + ' ' + name + ' — created (' + iso + ')');
  }

  await p.\$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 3. Install the schedule poster
# ===========================================================================
if [ -n "$SCHEDULE_IMG" ]; then
  echo ""
  echo "=== Installing schedule poster ==="
  EXT="${SCHEDULE_IMG##*.}"
  EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
  mkdir -p public/schedule-posters
  DEST="public/schedule-posters/cas-iec-season-4.${EXT_LOWER}"
  cp "$SCHEDULE_IMG" "$DEST"
  echo "  Copied $SCHEDULE_IMG → $DEST"
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.season.updateMany({
    where: {
      league: { slug: 'cas-iec' },
      OR: [{ name: { contains: 'Season 4', mode: 'insensitive' } }, { name: { contains: '4th', mode: 'insensitive' } }],
    },
    data: { scheduleImageUrl: '/schedule-posters/cas-iec-season-4.${EXT_LOWER}' },
  }).then(r => { console.log('  scheduleImageUrl set on ' + r.count + ' season(s).'); return p.\$disconnect(); });
  "
else
  echo ""
  echo "⚠  No image found in $POSTER_DIR — set scheduleImageUrl via Admin → Edit Season."
fi

# ===========================================================================
# 4. Commit + push the poster file
# ===========================================================================
echo ""
git add -A
if git diff --cached --quiet; then
  echo "(no file changes — DB-only)"
else
  git commit -m "CAS IEC Season 4: schedule poster"
  git push
fi
echo ""
echo "Done."
echo "Open: /leagues/cas-iec → Season 4 should show up with the poster + 6 rounds."
