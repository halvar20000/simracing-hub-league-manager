#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Replace Car model with the canonical version that keeps ALL back-relations
#    that the rest of the schema points at (Season, CarClass, Registration,
#    RaceResult, TeamResult) AND adds the new fields we need for the dropdown.
# ---------------------------------------------------------------------------
echo "=== 1. Rewrite Car model (with all back-relations preserved) ==="
cat > /tmp/lm_force_schema_v2.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');

const oldCarRe = /\nmodel Car \{[\s\S]*?\n\}\n?/g;
const before = s;
s = s.replace(oldCarRe, '\n');
if (s !== before) console.log('  Stripped existing Car model.');

const CAR_MODEL = `
model Car {
  id            String   @id @default(cuid())

  seasonId      String
  season        Season   @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  carClassId    String
  carClass      CarClass @relation(fields: [carClassId], references: [id], onDelete: Cascade)

  name          String
  shortName     String?
  iracingCarId  Int?
  displayOrder  Int      @default(0)

  registrations Registration[]
  raceResults   RaceResult[]
  teamResults   TeamResult[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([carClassId, name])
  @@index([carClassId])
  @@index([seasonId])
}
`;
s = s.trimEnd() + '\n' + CAR_MODEL;
fs.writeFileSync(FILE, s);
console.log('  Appended canonical Car model.');
JS
node /tmp/lm_force_schema_v2.js

echo ""
echo "-- Resulting Car model --"
awk '/^model Car \{/,/^\}/' prisma/schema.prisma

# ---------------------------------------------------------------------------
# 2. Update addCarsBulk to set seasonId on Car create (now required)
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Patch addCarsBulk to set seasonId ==="
cat > /tmp/lm_patch_action.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/cars.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Insert seasonId: cc.seasonId, just before carClassId, in the create block
s = s.replace(
  /create: \{\s*\n\s*carClassId,/,
  `create: {
        seasonId: cc.seasonId,
        carClassId,`
);

if (s === before) {
  console.error('  Could not patch addCarsBulk create block.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Added seasonId to create block.');
JS
node /tmp/lm_patch_action.js

echo ""
echo "-- Verify seasonId on create --"
grep -n 'seasonId: cc.seasonId' src/lib/actions/cars.ts

# ---------------------------------------------------------------------------
# 3. Push + regenerate
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ---------------------------------------------------------------------------
# 4. TS check
# ---------------------------------------------------------------------------
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 5. Commit + push
# ---------------------------------------------------------------------------
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Cars: canonical Car model w/ back-relations + admin Cars page (Step 1)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then visit:"
echo "  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<seasonId>"
echo "Click 'Manage cars →' near the season title and paste the GT4/GT3 lists."
