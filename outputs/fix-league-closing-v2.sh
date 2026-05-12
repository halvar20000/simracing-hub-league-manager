#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PG='src/app/leagues/[slug]/page.tsx'

echo "=== Show exact byte content of lines 388-395 (with line numbers) ==="
awk 'NR>=388 && NR<=395 { printf "%4d|%s|\n", NR, $0 }' "$PG"

echo ""
mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("); })}")) {
  console.log("Already patched.");
  process.exit(0);
}

// Find the position right after the FIRST top-level recentPodiums.map opening
// pattern, then walk forward looking for the matching `))}` to convert.
//
// Strategy: find `recentPodiums.map((entry) =>` (block-body opening I added).
// Then find the next `</Link>\n            ))}` after it.
const idx = s.indexOf("recentPodiums.map((entry) =>");
if (idx === -1) {
  console.error("Could not find new map opening.");
  process.exit(1);
}

// Search after idx for the pattern  `</Link>\n            ))}`.
// Use a regex that allows variable indentation on the ))} line.
const tail = s.slice(idx);
const re = /(<\/Link>\n)([ \t]+)(\)\)\})/;
const m = tail.match(re);
if (!m) {
  console.error("Could not find ))} after </Link>.");
  process.exit(1);
}
const matchOffset = idx + (m.index ?? 0);
const replacement = m[1] + m[2] + "); })}";
s = s.slice(0, matchOffset) + replacement + s.slice(matchOffset + m[0].length);

fs.writeFileSync(FILE, s);
console.log("Patched: '))}' converted to '); })}' after </Link>.");
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Re-dump lines 386-395 (post-fix) ==="
awk 'NR>=386 && NR<=395 { printf "%4d|%s|\n", NR, $0 }' "$PG"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "League page: fix closing of block-body recentPodiums map (regex anchor)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
