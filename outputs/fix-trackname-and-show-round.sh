#!/usr/bin/env bash
# Strip the trackName reference (doesn't exist) and show me the actual
# Round model so we know what to use instead.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

mkdir -p scripts
cat > scripts/patch-trackname.mjs <<'PATCH_EOF'
import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// Replace `R{round.roundNumber} · {round.trackName ?? "Round"}`
// with just `R{round.roundNumber}` for now — we'll add a real track
// label back as soon as we know which field to read.
s = s.replace(
  /R\{round\.roundNumber\}\s*·\s*\{round\.trackName \?\? "Round"\}/,
  "R{round.roundNumber}"
);

fs.writeFileSync(PAGE, s);
console.log("Removed round.trackName access from h1.");
PATCH_EOF

node scripts/patch-trackname.mjs

echo ""
echo "=== Round model in schema.prisma (so we can pick the right field) ==="
awk '/^model Round \{/{flag=1} flag; /^\}/{if(flag){flag=0; exit}}' prisma/schema.prisma

echo ""
echo "=== Other accesses to round.* in the public round page (sanity) ==="
grep -n 'round\.' "$PAGE" | head -30

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: drop bogus round.trackName access"
git push

echo ""
echo "Done. Wait ~60s for Vercel — build should now go green."
echo ""
echo "Then paste me the Round model from above and I'll add the correct"
echo "track / location label back to the h1 (probably round.name or"
echo "round.track or similar)."
