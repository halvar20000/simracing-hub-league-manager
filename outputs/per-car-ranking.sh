#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 0. Quick league inventory so we know slugs
# ===========================================================================
echo "=== League inventory ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.league.findMany({ select: { slug: true, name: true } }).then(ls => {
  for (const l of ls) console.log('  ' + l.slug + '  →  ' + l.name);
  p.\$disconnect();
});
"
echo ""

# ===========================================================================
# 1. Schema: add carId to RaceResult + back-relation on Car
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// 1a. RaceResult.carId
{
  const lines = s.split("\n");
  let inModel = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+RaceResult\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("RaceResult brace not found."); process.exit(1); }
  if (!/^\s*carId\s+String\?/m.test(s)) {
    lines.splice(close, 0,
      "  carId            String?",
      "  car              Car?     @relation(fields: [carId], references: [id])"
    );
    s = lines.join("\n");
    console.log("RaceResult: added carId.");
  }
}

// 1b. Car.raceResults back-relation
if (!/^\s*raceResults\s+RaceResult\[\]/m.test(s)) {
  s = s.replace(
    "  registrations Registration[]\n}",
    "  registrations Registration[]\n  raceResults   RaceResult[]\n}"
  );
  console.log("Car: added raceResults back-relation.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Backfill: existing RaceResults inherit carId from their Registration.
# ===========================================================================
echo ""
echo "=== Backfilling RaceResult.carId from Registration.carId ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const regs = await p.registration.findMany({
    where: { carId: { not: null } },
    select: { id: true, carId: true },
  });
  let updated = 0;
  for (const r of regs) {
    const res = await p.raceResult.updateMany({
      where: { registrationId: r.id, carId: null },
      data: { carId: r.carId },
    });
    updated += res.count;
  }
  console.log('  Backfilled ' + updated + ' race result rows.');
  await p.\$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
"

# ===========================================================================
# 3. JSON importer: auto-create Car (and CarClass if needed) + set carId
# ===========================================================================
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes("// CAR LOOKUP")) {
  // Add a helper that resolves carId, creating Car/CarClass on the fly.
  const helperBlock = `
// CAR LOOKUP — resolve a season's Car for an iRacing car_id.
// Auto-creates Car (and a default CarClass if the season has none).
async function resolveCarId(
  seasonId: string,
  iracingCarId: number,
  carName: string,
  carClassShortName: string | null
): Promise<string | null> {
  if (!iracingCarId || !Number.isFinite(iracingCarId)) return null;

  const existing = await prisma.car.findFirst({
    where: { seasonId, iracingCarId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Need a CarClass for the new Car. Use season's first, or auto-create.
  let carClass = await prisma.carClass.findFirst({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" } as never],
  });
  if (!carClass) {
    const shortCode = (carClassShortName ?? "ALL").slice(0, 8).toUpperCase();
    carClass = await prisma.carClass.create({
      data: {
        seasonId,
        name: carClassShortName ?? "All Cars",
        shortCode,
      },
    });
  }

  const created = await prisma.car.create({
    data: {
      seasonId,
      carClassId: carClass.id,
      name: carName || \`iRacing #\${iracingCarId}\`,
      iracingCarId,
    },
  });
  return created.id;
}
`;

  // Insert helper just below the imports.
  s = s.replace(
    `import {
  parseIracingEventJson,
  IracingJsonParseError,
  type ParsedEvent,
} from "@/lib/iracing-json";`,
    `import {
  parseIracingEventJson,
  IracingJsonParseError,
  type ParsedEvent,
} from "@/lib/iracing-json";
${helperBlock}`
  );

  // Pass car info from the parser to the importer. The parser already has
  // carClassShortName per driver. We need the iRacing car_id too — extend
  // ParsedDriver to carry it.
  console.log("Inserted resolveCarId helper.");
}

// Add carId resolution + write to RaceResult.create
if (!s.includes("carId: resolvedCarId")) {
  // Replace the existing prisma.raceResult.create to set carId.
  const oldCreate = `      await prisma.raceResult.create({
        data: {
          roundId,
          registrationId: reg.regId,
          raceNumber: session.raceNumber,
          finishPosition: d.finishPosition,
          startPosition: d.startingPosition,
          lapsCompleted: d.lapsComplete,
          raceDistancePct: distancePct,
          bestLapTimeMs: d.bestLapMs,
          qualifyingTimeMs: qualByCustId.get(d.custId) ?? null,
          iRating: d.iRating,
          incidents: d.incidents,
          finishStatus: d.finishStatus,
        },
      });`;
  const newCreate = `      const resolvedCarId = await resolveCarId(
        seasonId,
        d.carIracingId ?? 0,
        d.carName ?? "",
        d.carClassShortName
      );

      await prisma.raceResult.create({
        data: {
          roundId,
          registrationId: reg.regId,
          raceNumber: session.raceNumber,
          finishPosition: d.finishPosition,
          startPosition: d.startingPosition,
          lapsCompleted: d.lapsComplete,
          raceDistancePct: distancePct,
          bestLapTimeMs: d.bestLapMs,
          qualifyingTimeMs: qualByCustId.get(d.custId) ?? null,
          iRating: d.iRating,
          incidents: d.incidents,
          finishStatus: d.finishStatus,
          carId: resolvedCarId,
        },
      });

      // Keep the registration's "current car" in sync with latest result.
      if (resolvedCarId && resolvedCarId !== reg.currentCarId) {
        await prisma.registration.update({
          where: { id: reg.regId },
          data: { carId: resolvedCarId },
        });
        reg.currentCarId = resolvedCarId;
      }`;
  if (!s.includes(oldCreate)) {
    console.error("Importer: raceResult.create anchor not found.");
    process.exit(1);
  }
  s = s.replace(oldCreate, newCreate);

  // Extend the memberMap value to track currentCarId.
  s = s.replace(
    `  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null }>();`,
    `  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentCarId: string | null }>();`
  );
  s = s.replace(
    `    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
    });`,
    `    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
      currentCarId: reg.carId,
    });`
  );

  console.log("Importer: carId resolution wired.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-importer.mjs

# ===========================================================================
# 4. Parser: surface car_id and car_name on each ParsedDriver
# ===========================================================================
cat > outputs-tmp/patch-parser.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/iracing-json.ts";
let s = fs.readFileSync(FILE, "utf8");

// Add carIracingId + carName fields to ParsedDriver
if (!s.includes("carIracingId")) {
  s = s.replace(
    `  carClassShortName: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}`,
    `  carClassShortName: string | null;
  carIracingId: number | null;
  carName: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}`
  );
}

// Populate them inside buildSession
if (!s.includes("carIracingId: typeof r.car_id")) {
  s = s.replace(
    `        carClassShortName:
          typeof r.car_class_short_name === "string" ? r.car_class_short_name : null,`,
    `        carClassShortName:
          typeof r.car_class_short_name === "string" ? r.car_class_short_name : null,
        carIracingId: typeof r.car_id === "number" ? r.car_id : null,
        carName: typeof r.car_name === "string" ? r.car_name : null,`
  );
}

fs.writeFileSync(FILE, s);
console.log("Parser: car_id + car_name wired into ParsedDriver.");
EOF
node outputs-tmp/patch-parser.mjs

# ===========================================================================
# 5. Standings: add computeCarStandings
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("computeCarStandings")) {
  console.log("Standings: computeCarStandings already present.");
  process.exit(0);
}

// Append new types + function at the end.
s += `

// ============================================================================
// CAR STANDINGS
// Drivers grouped by the car they drove. Drivers who switched cars during the
// season appear under each car they used, with the points they actually
// scored while in that car.
// ============================================================================

export interface CarStandingDriver {
  registrationId: string;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  startNumber: number | null;
  teamName: string | null;
  rawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  correctionPoints: number;
  combinedTotal: number;
  roundsCompleted: number;
}

export interface CarStanding {
  carId: string;
  carName: string;
  carClassShortCode: string | null;
  drivers: CarStandingDriver[];
  totalPoints: number;
}

export async function computeCarStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<CarStanding[]> {
  const results = await prisma.raceResult.findMany({
    where: { round: { seasonId }, carId: { not: null } },
    include: {
      car: { include: { carClass: { select: { shortCode: true } } } },
      registration: {
        include: {
          user: { select: { firstName: true, lastName: true, countryCode: true } },
          team: { select: { name: true } },
        },
      },
    },
  });

  type Bucket = {
    raw: number; participation: number; manual: number; correction: number;
    rounds: Set<string>;
    firstName: string | null; lastName: string | null;
    countryCode: string | null; startNumber: number | null;
    teamName: string | null;
  };

  // Map<carId, { name, classShort, drivers: Map<regId, Bucket> }>
  const byCar = new Map<string, {
    name: string;
    classShort: string | null;
    drivers: Map<string, Bucket>;
  }>();

  for (const r of results) {
    if (!r.carId || !r.car) continue;
    let car = byCar.get(r.carId);
    if (!car) {
      byCar.set(r.carId, car = {
        name: r.car.name,
        classShort: r.car.carClass?.shortCode ?? null,
        drivers: new Map(),
      });
    }
    let b = car.drivers.get(r.registrationId);
    if (!b) {
      b = {
        raw: 0, participation: 0, manual: 0, correction: 0,
        rounds: new Set(),
        firstName: r.registration.user.firstName,
        lastName: r.registration.user.lastName,
        countryCode: r.registration.user.countryCode,
        startNumber: r.registration.startNumber,
        teamName: r.registration.team?.name ?? null,
      };
      car.drivers.set(r.registrationId, b);
    }
    b.raw += r.rawPointsAwarded;
    b.participation += r.participationPointsAwarded;
    b.manual += r.manualPenaltyPoints;
    b.correction += r.correctionPoints;
    b.rounds.add(r.roundId);
  }

  const out: CarStanding[] = [];
  for (const [carId, car] of byCar.entries()) {
    const drivers: CarStandingDriver[] = [];
    let totalPoints = 0;
    for (const [regId, b] of car.drivers.entries()) {
      const total = b.raw + b.participation - b.manual + b.correction;
      totalPoints += total;
      drivers.push({
        registrationId: regId,
        driverFirstName: b.firstName,
        driverLastName: b.lastName,
        countryCode: b.countryCode,
        startNumber: b.startNumber,
        teamName: b.teamName,
        rawPoints: b.raw,
        participationPoints: b.participation,
        manualPenalties: b.manual,
        correctionPoints: b.correction,
        combinedTotal: total,
        roundsCompleted: b.rounds.size,
      });
    }
    drivers.sort((a, b) => b.combinedTotal - a.combinedTotal);
    out.push({
      carId,
      carName: car.name,
      carClassShortCode: car.classShort,
      drivers,
      totalPoints,
    });
  }
  out.sort((a, b) => b.totalPoints - a.totalPoints);
  return out;
}
`;
fs.writeFileSync(FILE, s);
console.log("Standings: computeCarStandings appended.");
EOF
node outputs-tmp/patch-standings.mjs

# ===========================================================================
# 6. Standings page: add "By Car" tab + render
# ===========================================================================
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 6a. Import computeCarStandings + types
if (!s.includes("computeCarStandings")) {
  s = s.replace(
    `import {
  computeDriverStandings,
  computeTeamStandings,
  type DriverStanding,
  type TeamStanding,
} from "@/lib/standings";`,
    `import {
  computeDriverStandings,
  computeTeamStandings,
  computeCarStandings,
  type DriverStanding,
  type TeamStanding,
  type CarStanding,
} from "@/lib/standings";`
  );
}

// 6b. Extend Cls type
s = s.replace(
  `  type Cls = "combined" | "pro" | "am" | "team";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :
    clsRaw === "am" ? "am" :
    clsRaw === "team" ? "team" : "combined";`,
  `  type Cls = "combined" | "pro" | "am" | "team" | "car";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :
    clsRaw === "am" ? "am" :
    clsRaw === "team" ? "team" :
    clsRaw === "car" ? "car" : "combined";`
);

// 6c. Add cars fetch alongside drivers/teams
if (!s.includes("computeCarStandings(prisma")) {
  s = s.replace(
    `  const [drivers, previousDrivers, teams] = await Promise.all([
    computeDriverStandings(prisma, seasonId),`,
    `  const [drivers, previousDrivers, teams, cars] = await Promise.all([
    computeDriverStandings(prisma, seasonId),`
  );
  // Find the corresponding closing of Promise.all and insert the call.
  // Match the line "computeTeamStandings(prisma, seasonId)" → add cars call after teams.
  s = s.replace(
    /computeTeamStandings\(prisma, seasonId\),?\n(\s*)\]\);/,
    (m, indent) => `computeTeamStandings(prisma, seasonId),\n${indent}computeCarStandings(prisma, seasonId),\n${indent}]);`
  );
}

// 6d. Add the "By Car" tab into the toggle row
if (!s.includes('cls === "car"')) {
  s = s.replace(
    `<Link href={\`\${baseHref}?cls=team\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Team</Link>`,
    `<Link href={\`\${baseHref}?cls=team\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Team</Link>
          <Link href={\`\${baseHref}?cls=car\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "car" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>By Car</Link>`
  );
}

// 6e. Render block for cls === "car" — append at the end of the main return
if (!s.includes("{cls === \"car\" &&")) {
  // Insert before the final closing </div> of the page content.
  const carBlock = `
      {cls === "car" && (
        <section className="space-y-4">
          {cars.length === 0 ? (
            <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No car-tagged race results yet. Cars are auto-detected when you
              import an iRacing JSON file.
            </p>
          ) : (
            cars.map((car) => (
              <details
                key={car.carId}
                open
                className="rounded border border-zinc-800 bg-zinc-900/50"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
                  <span className="flex items-center gap-3">
                    {car.carClassShortCode && (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                        {car.carClassShortCode}
                      </span>
                    )}
                    <span className="font-display text-base font-semibold">
                      {car.carName}
                    </span>
                    <span className="text-xs text-zinc-500">
                      ({car.drivers.length} driver{car.drivers.length === 1 ? "" : "s"})
                    </span>
                  </span>
                </summary>
                <div className="border-t border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 w-10">Pos</th>
                        <th className="px-3 py-2">Driver</th>
                        <th className="px-3 py-2">Team</th>
                        <th className="px-3 py-2 text-right">Rounds</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {car.drivers.map((d, i) => (
                        <tr key={d.registrationId} className="border-t border-zinc-800">
                          <td className="px-3 py-2 font-medium">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <CountryFlag code={d.countryCode} />
                              {d.startNumber != null && (
                                <span className="text-xs text-zinc-500">
                                  #{d.startNumber}
                                </span>
                              )}
                              <span>
                                {d.driverFirstName} {d.driverLastName}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{d.teamName ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.roundsCompleted}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {d.combinedTotal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          )}
        </section>
      )}
`;

  // Insert before the final </div> of the main return. Use a regex to find
  // the LAST </div> in the file's main return (this can be brittle; we'll
  // fall back to inserting after the team rendering block if found).
  const teamAnchor = `      {cls === "team" && teams.length > 0 && (`;
  if (s.includes(teamAnchor)) {
    // Find the matching close of the team block and inject after it.
    // Simpler: insert the car block just BEFORE `{cls === "team"`.
    s = s.replace(teamAnchor, carBlock + teamAnchor);
  } else {
    console.error("Standings page: could not find team-block anchor.");
    process.exit(1);
  }
}

fs.writeFileSync(FILE, s);
console.log("Standings page: 'By Car' tab + render wired.");
EOF
node outputs-tmp/patch-standings-page.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Per-car ranking: track carId on race results, auto-create cars on JSON import, new 'By Car' standings view"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
