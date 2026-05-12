#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add iracingCarClassIds Int[] @default([]) to CarClass
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/iracingCarClassIds\s+Int\[\]/.test(s)) {
  console.log("Schema: iracingCarClassIds already present.");
  process.exit(0);
}
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+CarClass\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("CarClass model not found."); process.exit(1); }
lines.splice(close, 0, "  iracingCarClassIds Int[]     @default([])");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added iracingCarClassIds.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Update importer to also check iracingCarClassIds array
# ===========================================================================
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("iracingCarClassIds")) {
  console.log("Importer: iracingCarClassIds lookup already wired.");
  process.exit(0);
}
const before = `  if (iracingCarClassId != null) {
    const found = await prisma.carClass.findFirst({
      where: { seasonId, iracingCarClassId },
      select: { id: true },
    });
    if (found) return found;
  }`;
const after = `  if (iracingCarClassId != null) {
    const found = await prisma.carClass.findFirst({
      where: {
        seasonId,
        OR: [
          { iracingCarClassId },
          { iracingCarClassIds: { has: iracingCarClassId } },
        ],
      },
      select: { id: true },
    });
    if (found) return found;
  }`;
if (!s.includes(before)) { console.error("Importer: car class lookup anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Importer: lookup now checks iracingCarClassIds array.");
EOF
node outputs-tmp/patch-importer.mjs

# ===========================================================================
# 3. Merge GT3 Class + GT3 2025 → single "GT3"
# ===========================================================================
echo ""
echo "=== Merging GT3 classes ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
  });
  if (!season) { console.log('  CC IEC Season 3 not found.'); return; }

  const a = await p.carClass.findFirst({ where: { seasonId: season.id, iracingCarClassId: 2708 } });   // 'GT3 Class'
  const b = await p.carClass.findFirst({ where: { seasonId: season.id, iracingCarClassId: 4091 } });   // 'GT3 2025'
  if (!a || !b) { console.log('  GT3 classes not both found (a=' + !!a + ', b=' + !!b + '). Aborting.'); return; }

  // Pick primary = the one with most teamResults
  const aCount = await p.teamResult.count({ where: { carClassId: a.id } });
  const bCount = await p.teamResult.count({ where: { carClassId: b.id } });
  const primary = aCount >= bCount ? a : b;
  const secondary = primary.id === a.id ? b : a;
  console.log('  Primary: ' + primary.name + ' (id=' + primary.id + ', teamResults=' + (primary.id === a.id ? aCount : bCount) + ')');
  console.log('  Secondary (will be removed): ' + secondary.name + ' (id=' + secondary.id + ')');

  // 1. Move cars
  const moved = await p.car.updateMany({
    where: { carClassId: secondary.id },
    data: { carClassId: primary.id },
  });
  console.log('  Cars moved: ' + moved.count);

  // 2. Move TeamResults
  const movedTR = await p.teamResult.updateMany({
    where: { carClassId: secondary.id },
    data: { carClassId: primary.id },
  });
  console.log('  TeamResults moved: ' + movedTR.count);

  // 3. Move Registrations (probably 0 for IEC)
  const movedReg = await p.registration.updateMany({
    where: { carClassId: secondary.id },
    data: { carClassId: primary.id },
  });
  console.log('  Registrations moved: ' + movedReg.count);

  // 4. Move FPRAwards if any
  const movedFpr = await p.fPRAward.updateMany({
    where: { carClassId: secondary.id },
    data: { carClassId: primary.id },
  });
  console.log('  FPRAwards moved: ' + movedFpr.count);

  // 5. Add secondary's iRacing ID into primary's iracingCarClassIds list (and the primary's own ID for completeness)
  const ids = new Set([
    primary.iracingCarClassId,
    secondary.iracingCarClassId,
    ...(primary.iracingCarClassIds ?? []),
    ...(secondary.iracingCarClassIds ?? []),
  ].filter(x => x != null));
  await p.carClass.update({
    where: { id: primary.id },
    data: {
      name: 'GT3',
      shortCode: 'GT3',
      iracingCarClassIds: [...ids],
    },
  });
  console.log('  Primary renamed to GT3, iracingCarClassIds=' + JSON.stringify([...ids]));

  // 6. Delete secondary
  await p.carClass.delete({ where: { id: secondary.id } });
  console.log('  Secondary deleted.');

  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 4. Season page: add "Top 3 per class" section for IEC seasons
# ===========================================================================
cat > outputs-tmp/patch-season-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("computeTeamClassStandings")) {
  console.log("Season page: team-class podium already wired.");
  process.exit(0);
}

// Add the import alongside computeDriverStandings
s = s.replace(
  `import { computeDriverStandings } from "@/lib/standings";`,
  `import { computeDriverStandings, computeTeamClassStandings } from "@/lib/standings";`
);

// Fetch teamClasses near the bottom of data loading. Add after the season fetch.
s = s.replace(
  `  const registrationOpen =`,
  `  const teamClasses = await computeTeamClassStandings(prisma, seasonId);
  const isTeamEventSeason = teamClasses.length > 0;
  const registrationOpen =`
);

// Inject podium section just before the closing of the main content.
// We anchor on the </div> right before the registrations table or after the
// SeasonHero block. Easiest: insert as the FIRST child of the main return wrapper.
// Find the SeasonHero usage and insert immediately after it.
const heroAnchor = `<SeasonHero`;
if (s.includes(heroAnchor)) {
  // Find the closing /> of the SeasonHero element.
  const idx = s.indexOf(heroAnchor);
  // Walk forward to the next "/>"
  const endIdx = s.indexOf("/>", idx);
  if (endIdx > 0) {
    const insertAt = endIdx + 2; // after "/>"
    const podiumBlock = `

      {isTeamEventSeason && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-400">
            Class podiums
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {teamClasses.map((g) => (
              <div
                key={g.carClassId}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    {g.carClassShortCode}
                  </span>
                  <span className="font-display text-base font-semibold">
                    {g.carClassName}
                  </span>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {g.teams.slice(0, 3).map((t, i) => (
                    <li
                      key={t.teamId}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                      style={{
                        background:
                          i === 0
                            ? "linear-gradient(to right, rgba(234,179,8,0.18), transparent)"
                            : i === 1
                              ? "linear-gradient(to right, rgba(161,161,170,0.20), transparent)"
                              : "linear-gradient(to right, rgba(180,83,9,0.18), transparent)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium">{t.teamName}</span>
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-zinc-300">
                        {t.totalPoints} pts
                      </span>
                    </li>
                  ))}
                  {g.teams.length === 0 && (
                    <li className="text-xs text-zinc-500">No team finishes yet.</li>
                  )}
                </ol>
                {g.teams.length > 3 && (
                  <p className="mt-2 text-right text-xs text-zinc-500">
                    +{g.teams.length - 3} more
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}`;
    s = s.slice(0, insertAt) + podiumBlock + s.slice(insertAt);
    console.log("Season page: class podium block inserted after SeasonHero.");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-season-page.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "IEC: merge GT3 classes (CarClass.iracingCarClassIds list), add 'Class podiums' section on season page"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
