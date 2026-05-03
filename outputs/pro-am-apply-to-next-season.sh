#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. applyProAmToTargetSeason action
# ============================================================================
echo "=== 1. Append applyProAmToTargetSeason action ==="
cat > /tmp/lm_apply_proam.txt <<'BLOCK'

export async function applyProAmToTargetSeason(formData: FormData) {
  await requireAdmin();
  const sourceSeasonId = String(formData.get("sourceSeasonId") ?? "");
  const targetSeasonId = String(formData.get("targetSeasonId") ?? "");

  if (!sourceSeasonId || !targetSeasonId)
    throw new Error("Both source and target season IDs required");
  if (sourceSeasonId === targetSeasonId)
    throw new Error("Target must be different from source");

  const [source, target] = await Promise.all([
    prisma.season.findUnique({
      where: { id: sourceSeasonId },
      include: {
        league: true,
        rounds: { where: { countsForChampionship: true } },
        registrations: {
          where: { status: "APPROVED" },
          include: { raceResults: true },
        },
      },
    }),
    prisma.season.findUnique({
      where: { id: targetSeasonId },
      include: {
        league: true,
        registrations: { where: { status: "APPROVED" } },
      },
    }),
  ]);

  if (!source) throw new Error("Source season not found");
  if (!target) throw new Error("Target season not found");
  if (source.leagueId !== target.leagueId)
    throw new Error("Target must be in the same league");

  // Recompute the Pro/Am classification (same algorithm as the page).
  const totalRounds = source.rounds.length;
  const minStarts = Math.ceil(totalRounds / 2);
  const dropWorst = Math.floor(totalRounds / 4);
  const keepN = Math.max(1, totalRounds - dropWorst);
  const proPercent = 0.3;

  type Row = {
    registrationId: string;
    userId: string;
    storedProAmClass: "PRO" | "AM" | null;
    starts: number;
    adjustedAvg: number | null;
    avgIncidents: number;
    eligible: boolean;
  };

  const rows: Row[] = source.registrations.map((reg) => {
    const pointsByRound = new Map<string, number>();
    const incByRound = new Map<string, number>();
    for (const rr of reg.raceResults) {
      const pts =
        rr.rawPointsAwarded +
        rr.participationPointsAwarded -
        rr.manualPenaltyPoints +
        rr.correctionPoints;
      pointsByRound.set(rr.roundId, (pointsByRound.get(rr.roundId) ?? 0) + pts);
      incByRound.set(
        rr.roundId,
        (incByRound.get(rr.roundId) ?? 0) + rr.incidents
      );
    }
    const roundPoints = [...pointsByRound.values()];
    const roundIncidents = [...incByRound.values()];
    const starts = roundPoints.length;
    const eligible = starts >= minStarts;
    let adjustedAvg: number | null = null;
    if (eligible) {
      const sorted = [...roundPoints].sort((a, b) => b - a);
      const keep = sorted.slice(0, Math.min(keepN, sorted.length));
      adjustedAvg = keep.reduce((a, b) => a + b, 0) / keep.length;
    }
    const avgIncidents =
      starts > 0
        ? roundIncidents.reduce((a, b) => a + b, 0) / starts
        : 0;
    return {
      registrationId: reg.id,
      userId: reg.userId,
      storedProAmClass:
        (reg as { proAmClass: "PRO" | "AM" | null }).proAmClass ?? null,
      starts,
      adjustedAvg,
      avgIncidents,
      eligible,
    };
  });

  const eligibleSorted = rows
    .filter((r) => r.eligible)
    .sort((a, b) => {
      const aa = a.adjustedAvg ?? -Infinity;
      const bb = b.adjustedAvg ?? -Infinity;
      if (bb !== aa) return bb - aa;
      return a.avgIncidents - b.avgIncidents;
    });
  const proCount = Math.ceil(eligibleSorted.length * proPercent);
  const proRegIds = new Set(
    eligibleSorted.slice(0, proCount).map((r) => r.registrationId)
  );

  // Final class per source userId. Override (storedProAmClass) wins;
  // otherwise: Pro if eligible & in top 30%, Am if eligible & not, null if not eligible.
  const finalByUserId = new Map<string, "PRO" | "AM" | null>();
  for (const row of rows) {
    let cls: "PRO" | "AM" | null;
    if (row.storedProAmClass) cls = row.storedProAmClass;
    else if (!row.eligible) cls = null;
    else cls = proRegIds.has(row.registrationId) ? "PRO" : "AM";
    finalByUserId.set(row.userId, cls);
  }

  let appliedPro = 0;
  let appliedAm = 0;
  let appliedAuto = 0;
  let skipped = 0;

  for (const targetReg of target.registrations) {
    if (!finalByUserId.has(targetReg.userId)) {
      skipped++;
      continue;
    }
    const cls = finalByUserId.get(targetReg.userId) ?? null;
    await prisma.registration.update({
      where: { id: targetReg.id },
      data: { proAmClass: cls },
    });
    if (cls === "PRO") appliedPro++;
    else if (cls === "AM") appliedAm++;
    else appliedAuto++;
  }

  revalidatePath(
    `/admin/leagues/${source.league.slug}/seasons/${sourceSeasonId}/pro-am`
  );
  revalidatePath(
    `/admin/leagues/${source.league.slug}/seasons/${targetSeasonId}/roster`
  );

  const targetLabel = `${target.name} ${target.year}`;
  redirect(
    `/admin/leagues/${source.league.slug}/seasons/${sourceSeasonId}/pro-am?appliedPro=${appliedPro}&appliedAm=${appliedAm}&appliedAuto=${appliedAuto}&skipped=${skipped}&target=${encodeURIComponent(targetLabel)}`
  );
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/admin-registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('applyProAmToTargetSeason')) {
  console.log('  Already present.');
  process.exit(0);
}
// Make sure redirect is imported
if (!/import .*redirect.*from .next\/navigation./.test(s)) {
  s = 'import { redirect } from \"next/navigation\";\n' + s;
  console.log('  Added redirect import.');
}
const block = fs.readFileSync('/tmp/lm_apply_proam.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended applyProAmToTargetSeason.');
"

# ============================================================================
# 2. Patch pro-am page: searchParams + other-seasons fetch + Apply form + banner
# ============================================================================
echo ""
echo "=== 2. Patch pro-am page ==="
cat > /tmp/lm_proam_page_patch.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/pro-am/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Import the new action
if (!s.includes('applyProAmToTargetSeason')) {
  s = s.replace(
    /import ProAmOverrideSelect from "@\/components\/ProAmOverrideSelect";/,
    `import ProAmOverrideSelect from "@/components/ProAmOverrideSelect";
import { applyProAmToTargetSeason } from "@/lib/actions/admin-registrations";`
  );
}

// (b) Add searchParams to the page signature
s = s.replace(
  /export default async function ProAmCalculator\(\{\s*\n\s*params,\s*\n\s*\}: \{\s*\n\s*params: Promise<\{ slug: string; seasonId: string \}>;\s*\n\s*\}\)/,
  `export default async function ProAmCalculator({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{
    appliedPro?: string;
    appliedAm?: string;
    appliedAuto?: string;
    skipped?: string;
    target?: string;
  }>;
})`
);

// (c) Destructure searchParams just after params
s = s.replace(
  /const \{ slug, seasonId \} = await params;/,
  `const { slug, seasonId } = await params;
  const sp = await searchParams;`
);

// (d) Fetch otherSeasons after the season query
s = s.replace(
  /(if \(!season \|\| season\.league\.slug !== slug\) notFound\(\);)/,
  `$1

  const otherSeasons = await prisma.season.findMany({
    where: { leagueId: season.leagueId, id: { not: seasonId } },
    orderBy: [{ year: "desc" }, { name: "asc" }],
    select: { id: true, name: true, year: true, status: true },
  });`
);

// (e) Insert a result banner just after the page heading <p>
//     Anchor on the description paragraph that follows the H1.
if (!s.includes('Applied Pro/Am to')) {
  s = s.replace(
    /(\s*<p className="mt-1 text-sm text-zinc-400">\s*\n\s*Smart classification based on points-per-round across the season\.\s*\n\s*<\/p>\s*\n\s*<\/div>)/,
    `$1

      {sp.appliedPro !== undefined && (
        <div className="rounded border border-emerald-700/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          Applied Pro/Am to <strong>{sp.target?.replace(/\\+/g, " ")}</strong>:{" "}
          {sp.appliedPro} as Pro, {sp.appliedAm} as Am, {sp.appliedAuto} as
          Auto, {sp.skipped} skipped (no matching driver in target).
        </div>
      )}`
  );
}

// (f) Append the Apply-to-another-season section before the closing </div>
//     Anchor: very last `</div>\n  );\n}` of the component.
if (!s.includes('Apply to another season')) {
  s = s.replace(
    /(<\/section>\s*\n\s*\)\}\s*\n\s*<\/div>\s*\n\s*\);\s*\n\}$)/,
    `$1`.replace(
      /^/,
      ''
    )
  );

  // Different approach: insert before the very last `    </div>\n  );` (component closes)
  s = s.replace(
    /(\s*<\/div>\s*\n\s*\);\s*\n\}\s*$)/,
    `

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Apply to another season
        </h2>
        <form
          action={applyProAmToTargetSeason}
          className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3"
        >
          <input type="hidden" name="sourceSeasonId" value={seasonId} />
          <p className="text-sm text-zinc-300">
            Apply each driver&apos;s classification (override or algorithm
            result) to a chosen target season. Drivers are matched by user —
            those not registered in the target are skipped.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-zinc-400">
                Target season
              </label>
              <select
                name="targetSeasonId"
                required
                className="w-64 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Pick target season…
                </option>
                {otherSeasons.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.name} {os.year} ({os.status.replace("_", " ")})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
            >
              Apply Pro/Am
            </button>
          </div>
          {otherSeasons.length === 0 && (
            <p className="text-xs text-zinc-500">
              No other seasons in this league.
            </p>
          )}
        </form>
      </section>$1`
  );
}

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_proam_page_patch.js

echo ""
echo "-- Verify --"
grep -n 'applyProAmToTargetSeason\|Apply to another season\|Applied Pro/Am to\|otherSeasons' src/app/admin/leagues/\[slug\]/seasons/\[seasonId\]/pro-am/page.tsx | head -10

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Pro/Am: add 'Apply to another season' button — copies final classifications onto target season's registrations by userId match"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on the calculator page, scroll past the tables — there's now an"
echo "'Apply to another season' section. Pick a target season from the dropdown"
echo "and click 'Apply Pro/Am'. The action recomputes the source classification"
echo "and copies each driver's final value (override or algorithm result) onto"
echo "the matching registration in the target. A green banner shows up top with"
echo "the counts: Pro / Am / Auto / Skipped."
