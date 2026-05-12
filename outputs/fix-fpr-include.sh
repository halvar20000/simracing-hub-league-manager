#!/usr/bin/env bash
# Fix: FPRAward does NOT have a `registration` relation. Match the original
# shape: it has direct `team`, `carClass`, `user` (or whatever the original
# query asked for). Patch the include + the cells that read those fields.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

# First, see what relations FPRAward actually exposes in the schema.
echo "FPRAward relation hints from schema.prisma:"
awk '/^model FPRAward \{/{flag=1} /^\}/{flag=0} flag' prisma/schema.prisma || true
echo ""

node -e "
const fs = require('fs');
let s = fs.readFileSync('$PAGE', 'utf8');

// 1) Fix the fprAwards include block. Replace the whole nested-include
//    { registration: { include: { ... } } } with the flat one we know works:
//    { team: true, carClass: true, user: true }.
const badInclude = \`fprAwards: {
        include: {
          registration: {
            include: { team: true, carClass: true, user: true },
          },
        },
      },\`;
const goodInclude = \`fprAwards: {
        include: { team: true, carClass: true, user: true },
      },\`;
if (s.includes(badInclude)) {
  s = s.replace(badInclude, goodInclude);
  console.log('Fixed fprAwards include shape.');
} else if (s.includes('fprAwards: {\n        include: { team: true, carClass: true, user: true },')) {
  console.log('fprAwards include already flat.');
} else {
  console.log('Did not find expected nested include — printing current block for review:');
  const idx = s.indexOf('fprAwards: {');
  if (idx >= 0) console.log(s.slice(idx, idx + 200));
}

// 2) Fix the cells in the FPR table that use a.registration.user.* and
//    a.registration.carClass.* — switch to a.user.* and a.carClass.*.
s = s.replace(/a\\.registration\\.user\\.firstName/g, 'a.user?.firstName');
s = s.replace(/a\\.registration\\.user\\.lastName/g, 'a.user?.lastName');
s = s.replace(/a\\.registration\\.carClass/g, 'a.carClass');
s = s.replace(/a\\.registration\\.team/g, 'a.team');

fs.writeFileSync('$PAGE', s);
console.log('Cell references updated.');
"

echo ""
echo "Confirm no more a.registration.* references:"
grep -n 'a\\.registration' "$PAGE" || echo "  (none)"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: fix FPRAward include + cell access"
git push

echo ""
echo "Done. Wait ~60s for Vercel and verify the build goes green."
