#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'

echo "=== 1. Confirm button is still missing ==="
if grep -q 'recomputePenaltyPoolAction' "$FILE" && grep -q 'cas-gt3-wct' "$FILE"; then
  echo "  Button already present. Nothing to do."
  exit 0
fi

echo ""
echo "=== 2. Insert Recompute button before the 'Release all' form ==="
FILE="$FILE" node -e '
const fs = require("fs");
const FILE = process.env.FILE;
let s = fs.readFileSync(FILE, "utf8");
const before = s;

const ANCHOR = `      {season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (`;
if (!s.includes(ANCHOR)) {
  console.error("  Anchor not found:", ANCHOR.slice(0, 80));
  process.exit(1);
}

const NEW_BLOCK =
`      {season.league.slug === "cas-gt3-wct" && (
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

`;

s = s.replace(ANCHOR, NEW_BLOCK + ANCHOR);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Inserted Recompute button block.");
'

echo ""
echo "-- Verify --"
grep -nE 'cas-gt3-wct|recomputePenaltyPoolAction' "$FILE" | head -10

echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool admin page: actually add the 'Recompute auto-forgiveness pool' button (GT3 WCT only). Fixes silently-dropped regex from Phase 2."
git push

echo ""
echo "Done."
