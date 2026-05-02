#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 0. What does the schema currently say about Car / cars / carId? ==="
echo "-- Car model block --"
awk '/^model Car \{/,/^\}/' prisma/schema.prisma || true
echo ""
echo "-- CarClass.cars line --"
grep -n 'cars\s*Car\[\]\|cars Car\[\]' prisma/schema.prisma || echo "(missing)"
echo ""
echo "-- Registration.carId line --"
grep -n 'carId\s*String' prisma/schema.prisma || echo "(missing)"

# ---------------------------------------------------------------------------
# 1. Force the Car model to be the correct, complete version
# ---------------------------------------------------------------------------
echo ""
echo "=== 1. Rewrite Car model + ensure CarClass.cars + Registration.carId ==="
cat > /tmp/lm_force_schema.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');

// (a) Strip ANY existing Car model block (handles the partial-leftover case).
const oldCarRe = /\nmodel Car \{[\s\S]*?\n\}\n?/g;
const before = s;
s = s.replace(oldCarRe, '\n');
if (s !== before) console.log('  Removed existing Car model block(s).');

// (b) Append the correct, complete Car model.
const CAR_MODEL = `
model Car {
  id            String   @id @default(cuid())
  carClassId    String
  carClass      CarClass @relation(fields: [carClassId], references: [id], onDelete: Cascade)

  name          String
  shortName     String?
  iracingCarId  Int?
  displayOrder  Int      @default(0)

  registrations Registration[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([carClassId, name])
  @@index([carClassId])
}
`;
s = s.trimEnd() + '\n' + CAR_MODEL;
console.log('  Appended canonical Car model.');

// (c) Make sure CarClass has `cars Car[]`
{
  const re = /(model CarClass \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  CarClass model not found.'); process.exit(1); }
  if (!/\n\s+cars\s+Car\[\]/.test(m[1])) {
    s = s.replace(re, m[1] + '\n  cars         Car[]' + m[2]);
    console.log('  Added cars Car[] to CarClass.');
  } else {
    console.log('  CarClass.cars already present.');
  }
}

// (d) Make sure Registration has carId + car relation
{
  const re = /(model Registration \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  Registration model not found.'); process.exit(1); }
  if (!/\n\s+carId\s+String\?/.test(m[1])) {
    const inject = '\n  carId        String?\n  car          Car?     @relation(fields: [carId], references: [id], onDelete: SetNull)';
    s = s.replace(re, m[1] + inject + m[2]);
    console.log('  Added carId + car relation to Registration.');
  } else {
    console.log('  Registration.carId already present.');
  }
}

fs.writeFileSync(FILE, s);
JS
node /tmp/lm_force_schema.js

# ---------------------------------------------------------------------------
# 2. Show what the schema looks like now (so we can spot any oddity early)
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Resulting schema blocks ==="
echo "-- Car --"
awk '/^model Car \{/,/^\}/' prisma/schema.prisma
echo ""
echo "-- CarClass.cars line --"
grep -n 'cars\s*Car\[\]\|cars Car\[\]' prisma/schema.prisma
echo "-- Registration.carId line --"
grep -n 'carId\s*String' prisma/schema.prisma

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
git commit -m "Cars: schema fixup (canonical Car model) + admin Cars page (Step 1)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then visit:"
echo "  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<seasonId>"
echo "Click 'Manage cars →' near the season title and paste the GT4/GT3 lists."
