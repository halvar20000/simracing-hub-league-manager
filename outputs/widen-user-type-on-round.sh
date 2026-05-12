#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Widen every inline `user: { firstName: string | null; lastName: string | null }`
// to also include `countryCode: string | null`.
const re = /user:\s*\{\s*firstName:\s*string \| null;\s*lastName:\s*string \| null\s*\}/g;
const want = "user: { firstName: string | null; lastName: string | null; countryCode: string | null }";
const matches = s.match(re) ?? [];
let count = 0;
for (const m of matches) {
  if (s.includes(want)) {
    // Some occurrences may already be widened — replace only the un-widened ones
    const idx = s.indexOf(m);
    if (idx >= 0) {
      s = s.slice(0, idx) + want + s.slice(idx + m.length);
      count++;
    }
  } else {
    s = s.replace(m, want);
    count++;
  }
}
console.log(`Widened ${count} inline user type(s).`);
fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity:"
grep -n 'user: { firstName:' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' | head -10

git add -A
git commit -m "Round page: widen inline user types to include countryCode"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
