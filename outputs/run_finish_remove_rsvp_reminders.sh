#!/usr/bin/env bash
# Follow-up: the prior remove-reminders deploy left these files in the repo:
#   - src/app/api/cron/rsvp-reminders/route.ts
#   - src/lib/notify-rsvp-reminder.ts
#   - .github/workflows/cron-rsvp-reminders.yml
# The schema columns rsvpReminder48hAt / rsvpReminder12hAt are gone, so
# the Prisma client no longer recognises them — Vercel build fails with
# 'rsvpReminder48hAt does not exist in type RoundWhereInput'.
#
# This script removes them properly via `git rm -f` (deletes from disk
# AND stages the deletion) and pushes.
#
# Run from your Mac terminal:
#   bash outputs/run_finish_remove_rsvp_reminders.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/3  git rm reminder source files"
# -f: also remove if working tree differs from HEAD
# -r: recurse into the cron directory so the empty dir is also dropped
git rm -rf --ignore-unmatch \
  src/app/api/cron/rsvp-reminders \
  src/lib/notify-rsvp-reminder.ts \
  .github/workflows/cron-rsvp-reminders.yml

echo "==> 2/3  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 3/3  Commit + push (Vercel auto-deploys main)"
git add outputs/run_finish_remove_rsvp_reminders.sh
git commit -m "RSVP: finish reminder removal (delete the source files)

Earlier commit dropped the schema columns but left the route, helper,
and GitHub workflow in the repo, breaking the build with
'rsvpReminder48hAt does not exist in type RoundWhereInput'. Delete:
  - src/app/api/cron/rsvp-reminders/route.ts
  - src/lib/notify-rsvp-reminder.ts
  - .github/workflows/cron-rsvp-reminders.yml" || true
git push

echo "Done."
