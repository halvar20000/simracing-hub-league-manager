#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Is the 'Registration link' card in the admin season page? ==="
grep -n "Registration link\|Copy registration link\|CopyTextButton" 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' || echo "(NO matches — the card was never inserted)"

echo ""
echo "=== 2. Is the regenerate/clear-token form there? ==="
grep -n "regenerateRegistrationToken\|clearRegistrationToken" 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' || echo "(NO — token controls also missing)"

echo ""
echo "=== 3. Status of your seasons (the card only shows when OPEN_REGISTRATION or ACTIVE) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.season.findMany({
  include: { league: { select: { slug: true } } },
  orderBy: [{ year: 'desc' }, { name: 'asc' }],
}).then(rows => {
  for (const s of rows) {
    console.log('  ' + s.league.slug.padEnd(20) + ' / ' + s.name.padEnd(28) + '  status=' + s.status + '  registrationToken=' + (s.registrationToken ?? '∅'));
  }
  return p.\$disconnect();
});
"
