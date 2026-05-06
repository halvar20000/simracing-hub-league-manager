#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/layout.tsx'

echo "=== Add OpenGraph + Twitter metadata to root layout ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

if (s.includes('openGraph:')) {
  console.log('  Already has openGraph metadata.');
  process.exit(0);
}

// Insert openGraph + twitter into the existing metadata export, right after
// the description field.
s = s.replace(
  /(description:\s*\n?\s*\"League management for the CAS iRacing community\..*?\",)/s,
  \`\$1
  openGraph: {
    title: \"CLS — CAS League Scoring\",
    description:
      \"League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.\",
    url: \"/\",
    siteName: \"CLS\",
    type: \"website\",
    images: [
      {
        url: \"/logos/cls-league-scoring.png\",
        alt: \"CLS — CAS League Scoring\",
      },
    ],
  },
  twitter: {
    card: \"summary\",
    title: \"CLS — CAS League Scoring\",
    description:
      \"League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.\",
    images: [\"/logos/cls-league-scoring.png\"],
  },\`
);

if (s === before) {
  console.error('  Anchor not found — paste lines 25-35 of layout.tsx so I can adjust.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
sed -n '20,55p' "$FILE"

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
git commit -m "Layout metadata: add OpenGraph + Twitter card with CLS logo so Discord shows a thumbnail on link previews"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Test:"
echo "  1) Paste any league.simracing-hub.com URL into Discord"
echo "  2) Discord may show a cached preview without the logo at first —"
echo "     it caches OG tags for hours."
echo "     Workarounds:"
echo "       a) Use a URL that hasn't been pasted before"
echo "       b) Add a meaningless query param (e.g. ?v=1) to force refresh"
echo "       c) Wait a few hours for Discord's cache to expire"
echo "  3) If you want a faster/forceable check, the OG validators are:"
echo "       https://www.opengraph.xyz/url/<your-url>"
echo "       https://cards-dev.twitter.com/validator"
echo ""
echo "Card type 'summary' shows compact preview (small thumbnail on the side)."
echo "If you want the LARGE preview (banner-sized image), change the twitter"
echo "card type from 'summary' to 'summary_large_image' and let me know."
