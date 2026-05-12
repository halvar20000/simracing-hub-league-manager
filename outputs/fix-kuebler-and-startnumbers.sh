#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Register Thomas Kuebler for CC 10th
# ===========================================================================
echo "=== Registering Thomas Kuebler for CC 10th ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!season) { console.log('  CC 10th not found'); return; }
  const user = await p.user.findUnique({ where: { iracingMemberId: '479423' } });
  if (!user) { console.log('  Kuebler user not found'); return; }
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });
  const existing = await p.registration.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
  });
  if (existing && existing.status === 'APPROVED') {
    console.log('  Already registered + APPROVED.');
  } else if (existing) {
    await p.registration.update({
      where: { id: existing.id },
      data: { status: 'APPROVED', approvedById: admin?.id ?? null, approvedAt: new Date() },
    });
    console.log('  Upgraded to APPROVED.');
  } else {
    await p.registration.create({
      data: { seasonId: season.id, userId: user.id, status: 'APPROVED', approvedById: admin?.id ?? null, approvedAt: new Date() },
    });
    console.log('  Registered + APPROVED.');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 2. Parser: surface car_number from livery
# ===========================================================================
cat > outputs-tmp/patch-parser.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/iracing-json.ts";
let s = fs.readFileSync(FILE, "utf8");

// Add carNumber field to ParsedDriver
if (!s.includes("carNumber: string | null")) {
  s = s.replace(
    `  carIracingId: number | null;
  carName: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}`,
    `  carIracingId: number | null;
  carName: string | null;
  carNumber: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}`
  );
}

// Populate it inside buildSession (per-driver)
if (!s.includes('typeof r.livery?.car_number')) {
  s = s.replace(
    `        carIracingId: typeof r.car_id === "number" ? r.car_id : null,
        carName: typeof r.car_name === "string" ? r.car_name : null,`,
    `        carIracingId: typeof r.car_id === "number" ? r.car_id : null,
        carName: typeof r.car_name === "string" ? r.car_name : null,
        carNumber: typeof r.livery?.car_number === "string" ? r.livery.car_number : null,`
  );
}

fs.writeFileSync(FILE, s);
console.log("Parser: car_number wired.");
EOF
node outputs-tmp/patch-parser.mjs

# ===========================================================================
# 3. Importer: write Registration.startNumber from livery.car_number
# ===========================================================================
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("// Update startNumber from livery.car_number")) {
  console.log("Importer: startNumber sync already wired.");
  process.exit(0);
}

// Update the memberMap value type
s = s.replace(
  `  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentCarId: string | null }>();`,
  `  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentCarId: string | null; currentStartNumber: number | null }>();`
);
s = s.replace(
  `    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
      currentCarId: reg.carId,
    });`,
  `    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
      currentCarId: reg.carId,
      currentStartNumber: reg.startNumber,
    });`
);

// Inside the per-driver-row loop in importIracingJson, after the country code update, sync startNumber.
const before = `      // Update country code on user if differs and we have one
      if (d.countryCode && d.countryCode !== reg.currentCountry) {
        await prisma.user.update({
          where: { id: reg.userId },
          data: { countryCode: d.countryCode },
        });
        reg.currentCountry = d.countryCode;
      }`;
const after = `      // Update country code on user if differs and we have one
      if (d.countryCode && d.countryCode !== reg.currentCountry) {
        await prisma.user.update({
          where: { id: reg.userId },
          data: { countryCode: d.countryCode },
        });
        reg.currentCountry = d.countryCode;
      }

      // Update startNumber from livery.car_number when present + numeric.
      const carNumStr = (d as { carNumber?: string | null }).carNumber;
      if (carNumStr) {
        const n = parseInt(carNumStr, 10);
        if (Number.isFinite(n) && n !== reg.currentStartNumber) {
          await prisma.registration.update({
            where: { id: reg.regId },
            data: { startNumber: n },
          });
          reg.currentStartNumber = n;
        }
      }`;
if (!s.includes(before)) {
  console.error("Importer: country-code anchor not found.");
  process.exit(1);
}
s = s.replace(before, after);

fs.writeFileSync(FILE, s);
console.log("Importer: Registration.startNumber sync wired.");
EOF
node outputs-tmp/patch-importer.mjs

rm -rf outputs-tmp

# ===========================================================================
# 4. Re-import all 4 CC rounds via the inline replay logic to get startNumbers
#    populated immediately.
# ===========================================================================
echo ""
echo "=== Re-importing all 4 CC rounds (replace policy) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function tenK(v) { return typeof v === 'number' && v > 0 ? Math.round(v / 10) : null; }
function reasonStatus(r) {
  const x = (r ?? '').toLowerCase();
  if (!x || x === 'running' || x.includes('classified')) return 'CLASSIFIED';
  if (x.includes('disqualif') || x.includes('disconnect')) return 'DSQ';
  if (x.includes('did not start') || x === 'dns') return 'DNS';
  return 'DNF';
}

async function guessCarClassId(seasonId, carName) {
  const classes = await p.carClass.findMany({ where: { seasonId }, orderBy: { displayOrder: 'asc' } });
  const haystack = (carName || '').toLowerCase();
  for (const c of classes) {
    const tokens = c.name.toLowerCase().split(/\W+/).filter(t => t.length > 2);
    if (tokens.some(t => haystack.includes(t))) return c.id;
  }
  return classes[0]?.id ?? null;
}

async function ensureCar(seasonId, iracingCarId, carName) {
  if (!iracingCarId) return null;
  const ex = await p.car.findFirst({ where: { seasonId, iracingCarId } });
  if (ex) return ex;
  const carClassId = await guessCarClassId(seasonId, carName);
  if (!carClassId) return null;
  return p.car.create({ data: { seasonId, carClassId, name: carName || ('iRacing #' + iracingCarId), iracingCarId } });
}

async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!season) { console.log('CC 10th not found.'); return; }

  const regs = await p.registration.findMany({
    where: { seasonId: season.id, status: 'APPROVED' },
    include: { user: true },
  });
  const memberMap = new Map();
  for (const r of regs) {
    if (r.user.iracingMemberId) {
      memberMap.set(parseInt(r.user.iracingMemberId, 10), {
        regId: r.id, userId: r.userId,
        currentCountry: r.user.countryCode,
        currentCarId: r.carId,
        currentStartNumber: r.startNumber,
      });
    }
  }
  console.log('  Roster: ' + memberMap.size + ' approved drivers');

  for (const f of fs.readdirSync('CAS_Leagues/CC').filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync('CAS_Leagues/CC/' + f, 'utf8'));
    const data = j.data;
    const start = new Date(data.start_time);
    // Match by start time proximity (within 36h)
    const allRounds = await p.round.findMany({ where: { seasonId: season.id }, orderBy: { roundNumber: 'asc' } });
    let bestRound = null, bestDelta = Infinity;
    for (const r of allRounds) {
      const d = Math.abs(r.startsAt.getTime() - start.getTime());
      if (d < bestDelta) { bestDelta = d; bestRound = r; }
    }
    if (!bestRound || bestDelta > 36 * 3600 * 1000) {
      console.log('  ' + f + ' — no matching round, skipping');
      continue;
    }
    console.log('  ' + f + ' → R' + bestRound.roundNumber + ' ' + bestRound.name);

    // REPLACE
    await p.raceResult.deleteMany({ where: { roundId: bestRound.id } });

    // Qualifying lookup
    const qual = (data.session_results || []).find(s => s.simsession_type === 4);
    const qualByCust = new Map();
    if (qual) {
      for (const r of (qual.results || [])) {
        if (!r.cust_id) continue;
        qualByCust.set(r.cust_id, tenK(r.best_lap_time) ?? tenK(r.qual_lap_time));
      }
    }

    const races = (data.session_results || []).filter(s => s.simsession_type === 6);
    let raceNumber = 0;
    for (const race of races) {
      raceNumber++;
      const rows = (race.results || []).filter(r => r.cust_id);
      const maxLaps = rows.reduce((m, r) => Math.max(m, r.laps_complete || 0), 0);
      let imported = 0;
      for (const r of rows) {
        const reg = memberMap.get(r.cust_id);
        if (!reg) continue;

        // country code update
        const cc = typeof r.country_code === 'string' && r.country_code.length === 2 ? r.country_code.toUpperCase() : null;
        if (cc && cc !== reg.currentCountry) {
          await p.user.update({ where: { id: reg.userId }, data: { countryCode: cc } });
          reg.currentCountry = cc;
        }

        // startNumber update from livery.car_number
        const carNumStr = r.livery?.car_number;
        if (carNumStr) {
          const n = parseInt(carNumStr, 10);
          if (Number.isFinite(n) && n !== reg.currentStartNumber) {
            await p.registration.update({ where: { id: reg.regId }, data: { startNumber: n } });
            reg.currentStartNumber = n;
          }
        }

        // car
        const car = await ensureCar(season.id, r.car_id, r.car_name);
        if (car && car.id !== reg.currentCarId) {
          await p.registration.update({ where: { id: reg.regId }, data: { carId: car.id } });
          reg.currentCarId = car.id;
        }

        const distancePct = maxLaps > 0 ? Math.min(100, Math.floor((r.laps_complete / maxLaps) * 100)) : 0;
        await p.raceResult.create({
          data: {
            roundId: bestRound.id,
            registrationId: reg.regId,
            raceNumber,
            finishPosition: (r.finish_position ?? 0) + 1,
            startPosition: r.starting_position != null && r.starting_position >= 0 ? r.starting_position + 1 : null,
            lapsCompleted: r.laps_complete ?? 0,
            raceDistancePct: distancePct,
            bestLapTimeMs: tenK(r.best_lap_time),
            qualifyingTimeMs: qualByCust.get(r.cust_id) ?? null,
            iRating: typeof r.newi_rating === 'number' && r.newi_rating > 0 ? r.newi_rating : null,
            incidents: r.incidents ?? 0,
            finishStatus: reasonStatus(r.reason_out),
            carId: car?.id ?? null,
          },
        });
        imported++;
      }
      console.log('    race ' + raceNumber + ': ' + imported + ' rows');
    }
  }
  console.log('');
  console.log('=== Updated roster ===');
  const updated = await p.registration.findMany({
    where: { seasonId: season.id, status: 'APPROVED' },
    include: { user: true },
    orderBy: { startNumber: 'asc' },
  });
  for (const r of updated) {
    console.log('  #' + (r.startNumber ?? '-').toString().padEnd(3) + ' ' + (r.user.firstName ?? '?') + ' ' + (r.user.lastName ?? '?'));
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "iRacing JSON import: read livery.car_number → Registration.startNumber"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
