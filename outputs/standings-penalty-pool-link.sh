#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Locate the standings page
# ============================================================================
echo "=== 1. Locate standings page ==="
CANDIDATES=(
  "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx"
  "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx"
)
FILE=""
for c in "${CANDIDATES[@]}"; do
  if [ -f "$c" ]; then
    FILE="$c"
    echo "  Using: $FILE"
    break
  fi
done
if [ -z "$FILE" ]; then
  echo "!!! Couldn't find a standings page in expected locations."
  find src/app/leagues -maxdepth 6 -type f -name 'page.tsx' | head
  exit 1
fi

# ============================================================================
# 2. Patch — add Penalty Pool button for GT3 WCT
# ============================================================================
echo ""
echo "=== 2. Patch $FILE ==="
FILE="$FILE" node -e '
const fs = require("fs");
const FILE = process.env.FILE;
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Bail out cleanly if already wired
if (s.includes("/penalty-pool\"") && s.includes("cas-gt3-wct")) {
  console.log("  Button already present. Nothing to do.");
  process.exit(0);
}

// (a) Add Link import if missing
if (!/from\s+["']next\/link["']/.test(s)) {
  s = `import Link from "next/link";\n` + s;
}

// (b) Pick an anchor and insert the button block right after it.
//     Anchors tried, in order:
//        1) the first  <h1 ...>...</h1>  block
//        2) </header> closing tag
//     If none match, print head of file and abort.

const BUTTON_BLOCK = `
      {season.league.slug === "cas-gt3-wct" && (
        <div className="mb-4">
          <Link
            href={` + "`/leagues/${slug}/seasons/${seasonId}/penalty-pool`" + `}
            className="inline-block rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
          >
            View penalty pool →
          </Link>
        </div>
      )}
`;

let inserted = false;

// Anchor 1: end of an <h1>
const h1Re = /(<h1[^>]*>[\s\S]*?<\/h1>)/;
if (h1Re.test(s)) {
  s = s.replace(h1Re, `$1` + BUTTON_BLOCK);
  inserted = true;
}

if (!inserted) {
  console.error("  Could not find an <h1> anchor. Aborting; printing first 80 lines for inspection:");
  console.error(s.split("\n").slice(0, 80).join("\n"));
  process.exit(1);
}

// (c) Ensure `slug` and `seasonId` are in scope where we just inserted.
//     If the file destructures these from params already, we are fine.
//     If not, we leave that to the developer — but most pages do.
//     A tsc run downstream will catch any mismatch.

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
'

echo ""
echo "-- Verify --"
grep -nE 'cas-gt3-wct|penalty-pool' "$FILE" | head -10

# ============================================================================
# 3. tsc
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing. Most likely `slug`/`seasonId`/`season` not in scope at the insertion point."
  echo "    Paste the errors back and I will retarget."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Standings page: link to public penalty pool (GT3 WCT only)"
git push

echo ""
echo "Done."
