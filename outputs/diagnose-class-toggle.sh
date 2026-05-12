#!/usr/bin/env bash
# Three-part diagnosis:
#  1. Has the latest commit deployed? (local git log + remote sync)
#  2. Is season.isMulticlass true? Are CarClass shortCodes "PRO" / "AM"?
#  3. Does the on-disk public round page actually contain the toggle code?

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SEASON_ID="cmoeftuep0009lb04dlxe44ad"

echo "=== 1. Git state (compare with what Vercel deployed) ==="
git log -3 --oneline
echo "Local HEAD == origin/main?"
git rev-parse HEAD
git rev-parse origin/main
echo ""

echo "=== 2. Season + CarClasses for this season ==="
mkdir -p scripts
cat > scripts/check-season-classes.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const SEASON_ID = process.env.SEASON_ID!;

async function main() {
  const season = await prisma.season.findUnique({
    where: { id: SEASON_ID },
    select: { id: true, name: true, isMulticlass: true },
  });
  console.log("Season:", season);

  const classes = await prisma.carClass.findMany({
    where: { seasonId: SEASON_ID },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, shortCode: true, displayOrder: true },
  });
  console.log("CarClasses:");
  for (const c of classes) {
    console.log(" ", c);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
SEASON_ID="$SEASON_ID" npx tsx scripts/check-season-classes.ts

echo ""
echo "=== 3. Does the public round page on disk contain toggle code? ==="
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
echo "File line count:"
wc -l "$PAGE"
echo ""
echo "Lines with 'Combined' / 'By class' / 'cls === '/'isMulticlass':"
grep -n 'Combined\|By class\|cls ===\|isMulticlass\|cls=byclass' "$PAGE" | head -20
echo ""
echo "Confirm shortCode references exist:"
grep -n 'shortCode' "$PAGE" || echo "  (no shortCode references — toggle never reached this version)"
