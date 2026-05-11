#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'

mkdir -p scripts
cat > scripts/lm_patch_pool_public_v2.cjs <<'JS'
const fs = require("fs");
const FILE = process.env.FILE;
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Bail if already wired
if (s.includes("cleanCompleted")) {
  console.log("  Already patched.");
  process.exit(0);
}

// Anchor with the ACTUAL indentation (16 spaces on outer braces)
const CELL_ANCHOR =
  "                {rounds.map((r) => {\n" +
  "                  const pts = d.cellsByRound.get(r.id) ?? 0;\n" +
  "                  return (\n" +
  "                    <td\n" +
  "                      key={r.id}\n" +
  "                      className=\"px-2 py-2 text-center tabular-nums\"\n" +
  "                    >\n" +
  "                      {pts > 0 ? (\n" +
  "                        <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">\n" +
  "                          {pts}\n" +
  "                        </span>\n" +
  "                      ) : (\n" +
  "                        <span className=\"text-zinc-700\">—</span>\n" +
  "                      )}\n" +
  "                    </td>\n" +
  "                  );\n" +
  "                })}";

if (!s.includes(CELL_ANCHOR)) {
  console.error("  Cell anchor not found in public file. Printing actual cell area:");
  const lnIdx = s.indexOf("rounds.map((r) => {");
  // print 800 chars around the match
  if (lnIdx >= 0) console.error(s.slice(Math.max(0, lnIdx - 100), lnIdx + 800));
  process.exit(1);
}

const CELL_REPLACE = [
  "                {rounds.map((r) => {",
  "                  const pts = d.cellsByRound.get(r.id) ?? 0;",
  "                  const entered =",
  "                    enteredByReg.get(d.registrationId)?.has(r.id) ?? false;",
  "                  const cleanCompleted =",
  "                    pts === 0 && entered && r.status === \"COMPLETED\";",
  "                  return (",
  "                    <td",
  "                      key={r.id}",
  "                      className={" + "`" + 'px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}' + "`" + "}",
  "                    >",
  "                      {pts > 0 ? (",
  "                        <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">",
  "                          {pts}",
  "                        </span>",
  "                      ) : cleanCompleted ? (",
  "                        <span className=\"text-emerald-300\" title=\"Clean race\">✓</span>",
  "                      ) : (",
  "                        <span className=\"text-zinc-700\">—</span>",
  "                      )}",
  "                    </td>",
  "                  );",
  "                })}",
].join("\n");

s = s.replace(CELL_ANCHOR, CELL_REPLACE);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
JS

echo "=== Run patch ==="
FILE="$FILE" node scripts/lm_patch_pool_public_v2.cjs

echo ""
echo "-- Verify --"
grep -nE 'enteredByReg|cleanCompleted|bg-emerald-900' "$FILE" | head -10

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool public page: actually apply the clean-race green background (indentation fix)"
git push

echo ""
echo "Done."
