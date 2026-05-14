#!/usr/bin/env bash
# Deploy: remove the RSVP reminder feature entirely (no league uses it).
#
# Deletes:
#   - src/app/api/cron/rsvp-reminders/route.ts  (cron endpoint)
#   - src/lib/notify-rsvp-reminder.ts           (reminder helper)
#   - .github/workflows/cron-rsvp-reminders.yml (scheduler)
# Schema:
#   - drops Round.rsvpReminder48hAt + rsvpReminder12hAt via prisma db push
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_remove_rsvp_reminders.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/6  Delete reminder source files"
rm -f src/app/api/cron/rsvp-reminders/route.ts
rmdir src/app/api/cron/rsvp-reminders 2>/dev/null || true
rm -f src/lib/notify-rsvp-reminder.ts
rm -f .github/workflows/cron-rsvp-reminders.yml

echo "==> 2/6  prisma db push  (drops the two reminder columns from live DB)"
echo "    Prisma will warn about data loss on rsvpReminder48hAt/12hAt — that's expected."
echo "    Accepting --accept-data-loss because those columns are no longer used."
npx prisma db push --accept-data-loss

echo "==> 3/6  prisma generate"
npx prisma generate

echo "==> 4/6  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 5/6  Stage + commit"
git add -A \
  prisma/schema.prisma \
  CLAUDE.md \
  outputs/run_deploy_remove_rsvp_reminders.sh
# Record the deletes too (git add -A picks them up automatically once they're gone)
git commit -m "RSVP: remove 48h/12h reminder feature

No league uses RSVP reminders anymore — only the initial RSVP post is
needed. Delete:
  - src/app/api/cron/rsvp-reminders/route.ts
  - src/lib/notify-rsvp-reminder.ts
  - .github/workflows/cron-rsvp-reminders.yml
Drop schema columns Round.rsvpReminder48hAt and rsvpReminder12hAt.
Update CLAUDE.md with a removal pointer for anyone bringing it back." || true

echo "==> 6/6  Push (Vercel auto-deploys main)"
git push

echo ""
echo "Done. The reminder cron will no longer run; the initial RSVP post"
echo "(role-mention enabled for SFL) is now the only notification."
