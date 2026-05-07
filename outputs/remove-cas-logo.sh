#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Search for CAS logo references ==="
echo "-- in src/ --"
grep -rn -iE 'cas[-_ ]?logo|cas[-_ ]?iracing|"/cas\.|"/CAS\.' src/ 2>/dev/null || echo "  (none in src)"
echo ""
echo "-- public/ files matching cas* --"
ls public/ 2>/dev/null | grep -iE '^cas' || echo "  (no public/cas* files)"
echo ""

# ============================================================================
# 2. Try to remove logo block from nav.tsx
# ============================================================================
echo "=== 2. Patch nav.tsx to remove CAS logo ==="
node -e "
const fs = require('fs');
const FILE = 'src/components/nav.tsx';
if (!fs.existsSync(FILE)) {
  console.error('  nav.tsx not found at ' + FILE);
  process.exit(1);
}
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Strategy: remove any <Image ...> JSX whose src/alt mentions CAS,
// including a wrapping <Link> if there is one.

// (a) <Link ...><Image ... cas ... /></Link>
s = s.replace(
  /\s*<Link[^>]*>\s*<Image[^>]*(cas|CAS)[^>]*\/>\s*<\/Link>/g,
  ''
);

// (b) bare <Image ... cas ... />
s = s.replace(
  /\s*<Image[^>]*(cas|CAS)[^>]*\/>/g,
  ''
);

// (c) <a ...><img ... cas ... /></a>
s = s.replace(
  /\s*<a[^>]*>\s*<img[^>]*(cas|CAS)[^>]*\/?>\s*<\/a>/gi,
  ''
);

// (d) bare <img ... cas ... />
s = s.replace(
  /\s*<img[^>]*(cas|CAS)[^>]*\/?>/gi,
  ''
);

// Strip now-unused 'import Image from \"next/image\"' if no other Image left
if (!/<Image\b/.test(s)) {
  s = s.replace(/^import\s+Image\s+from\s+[\"']next\/image[\"'];?\s*\n/m, '');
}

if (s === before) {
  console.log('  No CAS logo Image/img tag found in nav.tsx — nothing to remove here.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched nav.tsx.');
}
"

# ============================================================================
# 3. Also check src/app/layout.tsx
# ============================================================================
echo ""
echo "=== 3. Patch src/app/layout.tsx (if logo is there) ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/layout.tsx';
if (!fs.existsSync(FILE)) {
  console.log('  layout.tsx not found, skipping.');
  process.exit(0);
}
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

s = s.replace(/\s*<Link[^>]*>\s*<Image[^>]*(cas|CAS)[^>]*\/>\s*<\/Link>/g, '');
s = s.replace(/\s*<Image[^>]*(cas|CAS)[^>]*\/>/g, '');
s = s.replace(/\s*<a[^>]*>\s*<img[^>]*(cas|CAS)[^>]*\/?>\s*<\/a>/gi, '');
s = s.replace(/\s*<img[^>]*(cas|CAS)[^>]*\/?>/gi, '');

if (!/<Image\b/.test(s)) {
  s = s.replace(/^import\s+Image\s+from\s+[\"']next\/image[\"'];?\s*\n/m, '');
}

if (s === before) {
  console.log('  No CAS logo in layout.tsx — nothing to remove here.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched layout.tsx.');
}
"

echo ""
echo "-- Verify no CAS logo references remain --"
grep -rn -iE 'cas[-_ ]?logo|<Image[^>]*cas|<img[^>]*cas' src/ 2>/dev/null || echo "  (clean)"

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
if git diff --cached --quiet; then
  echo "  Nothing staged — no changes to commit."
  exit 0
fi
git commit -m "Nav: remove CAS iRacing community logo (was overlapping the Leagues menu text)"
git push

echo ""
echo "Done."
