#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. SCHEMA: teamRegistration on Season, isLocked on CarClass
# ============================================================================
echo "=== 1. Schema ==="
cat > /tmp/lm_iec_schema.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Season.teamRegistration
{
  const re = /(model Season \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  Season model not found.'); process.exit(1); }
  if (!/\n\s+teamRegistration\s+Boolean/.test(m[1])) {
    s = s.replace(re, m[1] + '\n  teamRegistration  Boolean  @default(false)' + m[2]);
    console.log('  Added Season.teamRegistration.');
  } else {
    console.log('  Season.teamRegistration already present.');
  }
}

// CarClass.isLocked
{
  const re = /(model CarClass \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  CarClass model not found.'); process.exit(1); }
  if (!/\n\s+isLocked\s+Boolean/.test(m[1])) {
    s = s.replace(re, m[1] + '\n  isLocked      Boolean  @default(false)' + m[2]);
    console.log('  Added CarClass.isLocked.');
  } else {
    console.log('  CarClass.isLocked already present.');
  }
}

if (s !== before) fs.writeFileSync(FILE, s);
JS
node /tmp/lm_iec_schema.js

# ============================================================================
# 2. Push + regenerate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Inspect IEC season + classes + cars
# ============================================================================
echo ""
echo "=== 3. Current IEC state ==="
cat > ./_inspect_iec.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const seasons = await p.season.findMany({
    where: { league: { slug: 'cas-iec' } },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
    include: {
      league: true,
      carClasses: {
        orderBy: { displayOrder: 'asc' },
        include: { cars: { orderBy: { displayOrder: 'asc' } } },
      },
    },
  });
  for (const s of seasons) {
    console.log('---');
    console.log('Season ' + s.id);
    console.log('  ' + s.name + ' ' + s.year + '  status=' + s.status + '  teamRegistration=' + s.teamRegistration);
    for (const cc of s.carClasses) {
      console.log('  • Class ' + cc.id + '  name=' + cc.name + '  shortCode=' + cc.shortCode + '  isLocked=' + cc.isLocked + '  cars=' + cc.cars.length);
      for (const car of cc.cars) {
        console.log('      - ' + car.name + (car.iracingCarId !== null ? ' (iR ' + car.iracingCarId + ')' : ''));
      }
    }
  }
  await p.$disconnect();
})();
JS
node ./_inspect_iec.cjs
rm ./_inspect_iec.cjs

# ============================================================================
# 4. Server actions: toggleSeasonTeamRegistration + toggleCarClassLock
# ============================================================================
echo ""
echo "=== 4. Append server actions ==="

# (a) toggleSeasonTeamRegistration → seasons.ts
cat > /tmp/lm_team_action.txt <<'BLOCK'

export async function toggleSeasonTeamRegistration(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season) throw new Error("Season not found");
  await prisma.season.update({
    where: { id: seasonId },
    data: { teamRegistration: !season.teamRegistration },
  });
  revalidatePath(
    `/admin/leagues/${season.league.slug}/seasons/${seasonId}`
  );
}
BLOCK
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/seasons.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('toggleSeasonTeamRegistration')) {
  console.log('  toggleSeasonTeamRegistration already present.');
} else {
  const block = fs.readFileSync('/tmp/lm_team_action.txt', 'utf8');
  s = s.trimEnd() + '\n' + block + '\n';
  fs.writeFileSync(FILE, s);
  console.log('  Appended toggleSeasonTeamRegistration.');
}
"

# (b) toggleCarClassLock → cars.ts
cat > /tmp/lm_lock_action.txt <<'BLOCK'

export async function toggleCarClassLock(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");
  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      season: { include: { league: true } },
    },
  });
  if (!cc) throw new Error("CarClass not found");
  await prisma.carClass.update({
    where: { id: carClassId },
    data: { isLocked: !cc.isLocked },
  });
  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}
BLOCK
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/cars.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('toggleCarClassLock')) {
  console.log('  toggleCarClassLock already present.');
} else {
  const block = fs.readFileSync('/tmp/lm_lock_action.txt', 'utf8');
  s = s.trimEnd() + '\n' + block + '\n';
  fs.writeFileSync(FILE, s);
  console.log('  Appended toggleCarClassLock.');
}
"

# ============================================================================
# 5. Admin season page: add team registration toggle in the buttons row
# ============================================================================
echo ""
echo "=== 5. Patch admin season page ==="
cat > /tmp/lm_season_team_btn.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('toggleSeasonTeamRegistration')) {
  console.log('  Already wired.');
  process.exit(0);
}

// Add import alongside the other seasons.ts imports
s = s.replace(
  /import \{ regenerateRegistrationToken, clearRegistrationToken \} from "@\/lib\/actions\/seasons";/,
  `import { regenerateRegistrationToken, clearRegistrationToken, toggleSeasonTeamRegistration } from "@/lib/actions/seasons";`
);

// Insert the toggle button right after the Statistics → Link inside the buttons row.
s = s.replace(
  /(href=\{`\/leagues\/\$\{slug\}\/seasons\/\$\{seasonId\}\/stats`\}[\s\S]*?Statistics →[\s\S]*?<\/Link>)/,
  `$1
                <form action={toggleSeasonTeamRegistration}>
                  <input type="hidden" name="seasonId" value={seasonId} />
                  <button
                    type="submit"
                    className={\`rounded border px-3 py-1 text-sm \${
                      season.teamRegistration
                        ? "border-emerald-700 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }\`}
                    title="When ON, registration uses the team-leader form (one leader + up to 4 teammates)."
                  >
                    {season.teamRegistration ? "✓ Team registration ON" : "Team registration OFF"}
                  </button>
                </form>`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_season_team_btn.js

# ============================================================================
# 6. Cars admin page: add Lock/Unlock button per CarClass header
# ============================================================================
echo ""
echo "=== 6. Patch cars admin page ==="
cat > /tmp/lm_cars_lock_btn.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('toggleCarClassLock')) {
  console.log('  Already wired.');
  process.exit(0);
}

// Add import
s = s.replace(
  /import \{\s*\n\s*addCarsBulk,\s*\n\s*deleteCar,\s*\n\s*updateCarIracingId,\s*\n\s*addCarClass,\s*\n\s*deleteCarClass,\s*\n\} from "@\/lib\/actions\/cars";/,
  `import {
  addCarsBulk,
  deleteCar,
  updateCarIracingId,
  addCarClass,
  deleteCarClass,
  toggleCarClassLock,
} from "@/lib/actions/cars";`
);

// Insert the Lock/Unlock button into each class header next to the Delete class button.
// The header structure ends with a "Delete class" form. We anchor before that
// form so the Lock button appears to its left.
s = s.replace(
  /(<h2 className="text-lg font-semibold">[\s\S]*?<\/h2>\s*\n\s*)({cc\._count\.cars === 0 && \(\s*\n\s*<form action=\{deleteCarClass\}>)/,
  `$1<form action={toggleCarClassLock} className="mr-2">
              <input type="hidden" name="carClassId" value={cc.id} />
              <button
                type="submit"
                className={\`rounded border px-2 py-1 text-xs \${
                  cc.isLocked
                    ? "border-amber-700/50 bg-amber-950/40 text-amber-200"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }\`}
                title="Locked classes cannot accept new registrations. Existing teams stay."
              >
                {cc.isLocked ? "🔒 Locked" : "Lock class"}
              </button>
            </form>
            $2`
);

if (s === before) {
  console.error('  Anchor not found in cars admin page.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_cars_lock_btn.js

# ============================================================================
# 7. Verify
# ============================================================================
echo ""
echo "=== 7. Verify ==="
echo "-- schema --"
grep -n 'teamRegistration\|isLocked' prisma/schema.prisma | head -5
echo ""
echo "-- actions --"
grep -n 'toggleSeasonTeamRegistration\|toggleCarClassLock' src/lib/actions/seasons.ts src/lib/actions/cars.ts | head -5
echo ""
echo "-- season page button --"
grep -n 'toggleSeasonTeamRegistration\|Team registration' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' | head -5
echo ""
echo "-- cars page lock button --"
grep -n 'toggleCarClassLock\|Lock class' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx' | head -5

# ============================================================================
# 8. TS check
# ============================================================================
echo ""
echo "=== 8. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 9. Commit + push
# ============================================================================
echo ""
echo "=== 9. Commit + push ==="
git add -A
git status --short
git commit -m "IEC: schema fields (Season.teamRegistration, CarClass.isLocked) + admin toggles for both"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Step-3 output above shows the current IEC season + class state. Eyeball:"
echo "  • Are the right classes there (GT3, LMP2, Porsche Cup)?"
echo "  • Does each class have its cars defined (LMP2 needs the Dallara P217;"
echo "    Porsche Cup needs the 911 (992) Cup)?"
echo "  • Note any missing cars — we'll add them in Phase 2 alongside the"
echo "    team-leader form."
echo ""
echo "After deploy:"
echo "  • Admin season page (e.g. cas-iec) → click 'Team registration OFF' to"
echo "    flip it to ON. Tooltip explains the mode."
echo "  • Admin /cars page → each class card has a 'Lock class' button. Locked"
echo "    classes show '🔒 Locked' in amber."
echo ""
echo "Phase 2 will use these flags to drive the team-leader registration form"
echo "and the team-grouped roster."
