#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Change vercel.json cron schedule to daily (Hobby-tier compatible) ==="
node -e "
const fs = require('fs');
const FILE = 'vercel.json';
const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (Array.isArray(j.crons)) {
  for (const c of j.crons) {
    if (c.path === '/api/cron/notify-reporting-open') {
      c.schedule = '0 9 * * *';
    }
  }
}
fs.writeFileSync(FILE, JSON.stringify(j, null, 2) + '\n');
console.log('  vercel.json updated.');
"

echo ""
cat vercel.json

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Cron: daily 09:00 UTC schedule (Vercel Hobby tier limit; previous */30 was blocking deploys)"
git push

echo ""
echo "Done. Wait ~60s for Vercel to deploy the BACKLOG of stuck commits."
echo ""
echo "After it goes green:"
echo "  • The /api/cron/notify-reporting-open route should be live"
echo "  • Cron will run daily at 09:00 UTC"
echo "  • Test with curl right now:"
echo ""
echo "      curl -H \"Authorization: Bearer 63a209594c7bd3f3031e3bf46d7789a8c456209dec27b46075b3618ff3ac5631\" \\"
echo "        https://league.simracing-hub.com/api/cron/notify-reporting-open"
echo ""
echo "    Should return JSON {ok:true, fired:[], skipped:[]} now."
