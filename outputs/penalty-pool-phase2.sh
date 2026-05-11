#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. admin-reports.ts — trigger recompute after submitDecision / deleteDecision
# ============================================================================
echo "=== 1. Patch src/lib/actions/admin-reports.ts ==="
node -e '
const fs = require("fs");
const FILE = "src/lib/actions/admin-reports.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// (a) Add import (after the requireSteward import line)
if (!s.includes("recomputePenaltyPoolForSeason")) {
  s = s.replace(
    /import \{ requireSteward \} from "@\/lib\/auth-helpers";\n/,
    `import { requireSteward } from "@/lib/auth-helpers";\nimport { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";\n`
  );
}

// (b) In submitDecision: recompute right before the final revalidatePath block
s = s.replace(
  /(  revalidatePath\(\s*\n\s*`\/admin\/leagues\/\$\{leagueSlug\}\/seasons\/\$\{seasonId\}\/reports`\s*\n\s*\);\s*\n\s*revalidatePath\(`\/reports\/\$\{reportId\}`\);)/,
  `  // Penalty pool: recompute auto-forgiveness (GT3 WCT only; engine guards by slug)\n  await recomputePenaltyPoolForSeason(seasonId);\n\n$1`
);

// (c) In deleteDecision: recompute right before the final revalidatePath block
s = s.replace(
  /(  await prisma\.incidentReport\.update\(\{\s*\n\s*where: \{ id: reportId \},\s*\n\s*data: \{ status: "UNDER_REVIEW" \},\s*\n\s*\}\);\s*\n\s*revalidatePath\(\s*\n\s*`\/admin\/leagues\/\$\{leagueSlug\}\/seasons\/\$\{seasonId\}\/reports\/\$\{reportId\}`)/,
  `$1`
).replace(
  /(  await prisma\.incidentReport\.update\(\{\s*\n\s*where: \{ id: reportId \},\s*\n\s*data: \{ status: "UNDER_REVIEW" \},\s*\n\s*\}\);)\s*\n(\s*revalidatePath\()/,
  `$1\n  await recomputePenaltyPoolForSeason(seasonId);\n$2`
);

if (s === before) {
  console.error("  No edits made to admin-reports.ts");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
'

echo "-- Verify --"
grep -nE 'recomputePenaltyPoolForSeason' src/lib/actions/admin-reports.ts || true

# ============================================================================
# 2. rounds.ts — recompute when round status is COMPLETED
# ============================================================================
echo ""
echo "=== 2. Patch src/lib/actions/rounds.ts ==="
node -e '
const fs = require("fs");
const FILE = "src/lib/actions/rounds.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// (a) Add import
if (!s.includes("recomputePenaltyPoolForSeason")) {
  s = s.replace(
    /import \{ requireAdmin \} from "@\/lib\/auth-helpers";\n/,
    `import { requireAdmin } from "@/lib/auth-helpers";\nimport { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";\n`
  );
}

// (b) After updateRound prisma update, recompute if status === COMPLETED
s = s.replace(
  /(  await prisma\.round\.update\(\{\s*\n\s*where: \{ id: roundId \},\s*\n\s*data: \{\s*\n[\s\S]*?\n\s*\},\s*\n\s*\}\);)\s*\n(\s*revalidatePath\()/,
  `$1\n\n  // Penalty pool: recompute auto-forgiveness when a round is marked complete\n  if (status === "COMPLETED") {\n    await recomputePenaltyPoolForSeason(seasonId);\n  }\n\n$2`
);

if (s === before) {
  console.error("  No edits made to rounds.ts");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
'

echo "-- Verify --"
grep -nE 'recomputePenaltyPoolForSeason' src/lib/actions/rounds.ts || true

# ============================================================================
# 3. penalty-pool/page.tsx — eff calc, summary chip, Recompute button
# ============================================================================
echo ""
echo "=== 3. Patch admin penalty-pool/page.tsx ==="
node -e '
const fs = require("fs");
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// (a) Add import for recompute action
if (!s.includes("penalty-pool-recompute")) {
  s = s.replace(
    /(} from "@\/lib\/actions\/penalty-pool";\n)/,
    `$1import { recomputePenaltyPoolAction } from "@/lib/actions/penalty-pool-recompute";\n`
  );
}

// (b) Row type: add autoForgivenPoints
s = s.replace(
  /(    forgivenPoints: number;\s*\n    releasedPoints: number;)/,
  `    forgivenPoints: number;\n    autoForgivenPoints: number;\n    releasedPoints: number;`
);

// (c) Initial row creation
s = s.replace(
  /(        forgivenPoints: 0,\s*\n        releasedPoints: 0,)/,
  `        forgivenPoints: 0,\n        autoForgivenPoints: 0,\n        releasedPoints: 0,`
);

// (d) Per-penalty aggregation: subtract autoForgivenPoints in eff, accumulate autoForgivenPoints
s = s.replace(
  /    const pts = p\.pointsValue \?\? 0;\s*\n    const eff = Math\.max\(0, pts - p\.forgivenPoints\);\s*\n    if \(p\.releasedAt\) row\.releasedPoints \+= eff;\s*\n    else row\.pendingPoints \+= eff;\s*\n    row\.forgivenPoints \+= p\.forgivenPoints;\s*\n    row\.penalties\.push\(p\);/,
`    const pts = p.pointsValue ?? 0;
    const eff = Math.max(0, pts - p.forgivenPoints - p.autoForgivenPoints);
    if (p.releasedAt) row.releasedPoints += eff;
    else row.pendingPoints += eff;
    row.forgivenPoints += p.forgivenPoints;
    row.autoForgivenPoints += p.autoForgivenPoints;
    row.penalties.push(p);`
);

// (e) Totals: add autoForgiven
s = s.replace(
  /(    forgiven: drivers\.reduce\(\(s, d\) => s \+ d\.forgivenPoints, 0\),)/,
  `$1\n    autoForgiven: drivers.reduce((s, d) => s + d.autoForgivenPoints, 0),`
);

// (f) Summary-chip row: add "Auto-forgiven" chip after Released
s = s.replace(
  /(          <span className="rounded bg-red-900\/40 px-2 py-1 text-red-200">\s*\n\s*Released: <strong>\{totals\.released\}<\/strong>\s*\n\s*<\/span>)/,
`$1
          {totals.autoForgiven > 0 && (
            <span className="rounded bg-cyan-900/40 px-2 py-1 text-cyan-200">
              Auto-forgiven: <strong>{totals.autoForgiven}</strong>
            </span>
          )}`
);

// (g) Recompute button — insert AFTER the summary chips div, BEFORE the
//     conditional "Release all" form. Only for GT3 WCT.
//     Anchor: the closing </div> of the totals chips wrapper, then a blank line,
//     then the deferPenaltyPoints conditional.
s = s.replace(
  /(\s*<\/div>\s*\n      <\/div>\s*\n\s*\n      \{season\.scoringSystem\.deferPenaltyPoints && totals\.pending > 0 && \()/,
`$1`.replace(
    `{season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (`,
    `{season.league.slug === "cas-gt3-wct" && (
        <form action={recomputePenaltyPoolAction}>
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="leagueSlug" value={slug} />
          <SubmitWithSpinner
            label="Recompute auto-forgiveness pool"
            pendingLabel="Recomputing…"
            className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
          />
          <span className="ml-2 text-xs text-zinc-500">
            2 clean rounds forgive 1 pool point. Runs automatically after decisions are published and rounds are marked complete.
          </span>
        </form>
      )}

      {season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (`
  )
);

// (h) Per-penalty inline eff (in the table row map)
s = s.replace(
  /(                      const pts = p\.pointsValue \?\? 0;\s*\n)(                      const eff = Math\.max\(0, pts - p\.forgivenPoints\);)/,
  `$1                      const eff = Math.max(0, pts - p.forgivenPoints - p.autoForgivenPoints);`
);

// (i) Show "−N auto" hint below the points value in the Pts cell
s = s.replace(
  /(<td className="px-2 py-2 text-right tabular-nums">\{pts\}<\/td>)/,
`<td className="px-2 py-2 text-right tabular-nums">
                            {pts}
                            {p.autoForgivenPoints > 0 && (
                              <div className="text-[10px] text-cyan-400">
                                −{p.autoForgivenPoints} auto
                              </div>
                            )}
                          </td>`
);

if (s === before) {
  console.error("  No edits made to penalty-pool/page.tsx");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
'

echo "-- Verify --"
grep -nE 'recomputePenaltyPoolAction|autoForgivenPoints|cas-gt3-wct' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx' | head -20

# ============================================================================
# 4. tsc
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool (Phase 2): auto-recompute on decision publish + round COMPLETED. Admin UI shows auto-forgiveness in eff calc, summary chip, per-penalty hint, and Recompute button (GT3 WCT only)."
git push

echo ""
echo "Done."
