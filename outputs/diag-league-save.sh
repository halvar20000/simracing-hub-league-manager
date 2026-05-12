#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Stored values on GT4 TSS league ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.league.findUnique({ where: { slug: 'cas-tss-gt4' } }).then(l => {
  if (!l) { console.log('(not found)'); return; }
  console.log('  name                          : ' + l.name);
  console.log('  discordRegistrationsWebhookUrl: ' + (l.discordRegistrationsWebhookUrl ?? 'NULL'));
  console.log('  registrationNotifyEmails      : ' + JSON.stringify(l.registrationNotifyEmails));
  return p.\$disconnect();
});
"

echo ""
echo "=== updateLeague action content ==="
cat src/lib/actions/leagues.ts | grep -n -A 1 "updateLeague\|discordRegistrationsWebhookUrl\|registrationNotifyEmails" | head -40

echo ""
echo "=== Edit page bindings (defaultValue lines) ==="
grep -n -E "defaultValue|registrationNotifyEmails|discordRegistrationsWebhookUrl|league\." 'src/app/admin/leagues/[slug]/edit/page.tsx'
