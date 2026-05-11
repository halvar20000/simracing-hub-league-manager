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
  echo "!!! Couldn't find a standings page."
  find src/app/leagues -maxdepth 6 -type f -name 'page.tsx' | head
  exit 1
fi

# ============================================================================
# 2. Write the patch as a Node script to a real file (avoids shell quoting)
# ============================================================================
echo ""
echo "=== 2. Write Node patch script ==="
mkdir -p scripts
cat > scripts/lm_patch_standings.cjs <<'JS'
const fs = require("fs");
const FILE = process.env.FILE;
if (!FILE) {
  console.error("FILE env var not set");
  process.exit(1);
}
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Already wired? skip.
if (s.includes('href={`/leagues/${slug}/seasons/${seasonId}/penalty-pool`}') &&
    s.includes('cas-gt3-wct')) {
  console.log("  Button already present. Nothing to do.");
  process.exit(0);
}

// (a) Add Link import if missing
const linkImportRe = /from\s+["']next\/link["']/;
if (!linkImportRe.test(s)) {
  s = `import Link from "next/link";\n` + s;
}

// (b) Insert the button block right after the first <h1>...</h1>
const BUTTON_BLOCK =
`
      {season.league.slug === "cas-gt3-wct" && (
        <div className="mb-4">
          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}/penalty-pool\`}
            className="inline-block rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
          >
            View penalty pool →
          </Link>
        </div>
      )}
`;

const h1Re = /(<h1[^>]*>[\s\S]*?<\/h1>)/;
if (!h1Re.test(s)) {
  console.error("  Could not find an <h1> anchor. Printing first 80 lines:");
  console.error(s.split("\n").slice(0, 80).join("\n"));
  process.exit(1);
}
s = s.replace(h1Re, "$1" + BUTTON_BLOCK);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
JS

echo "  Wrote scripts/lm_patch_standings.cjs"

# ============================================================================
# 3. Run the patch
# ============================================================================
echo ""
echo "=== 3. Run patch ==="
FILE="$FILE" node scripts/lm_patch_standings.cjs

echo ""
echo "-- Verify --"
grep -nE 'cas-gt3-wct|penalty-pool' "$FILE" | head -10

# ============================================================================
# 4. tsc
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing. Paste them back and I will retarget."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Standings page: link to public penalty pool (GT3 WCT only)"
git push

echo ""
echo "Done."
