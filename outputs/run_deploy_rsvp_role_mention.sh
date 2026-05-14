#!/usr/bin/env bash
# Deploy: per-league discordRsvpRoleId. The initial RSVP post will
# @mention the configured role; reminders are unaffected.
#
# This script does:
#   1. prisma db push   — adds League.discordRsvpRoleId column to live Neon
#   2. prisma generate  — regenerates Prisma client locally so tsc sees field
#   3. tsc check
#   4. git commit + push (Vercel auto-deploys main)
#   5. set SFL Cup's discordRsvpRoleId to 1224317904145616946
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_rsvp_role_mention.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/5  prisma db push  (adds column to live DB)"
npx prisma db push

echo "==> 2/5  prisma generate  (regenerate typed client)"
npx prisma generate

echo "==> 3/5  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/5  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/lib/discord-bot.ts \
  src/lib/notify-rsvp.ts \
  scripts/lm_set_sfl_rsvp_role_id.ts \
  outputs/run_deploy_rsvp_role_mention.sh
git commit -m "RSVP: optional role @mention on the initial post

Add League.discordRsvpRoleId (optional). When set, notify-rsvp prepends
<@&ROLE_ID> to the message content and includes the role in
allowed_mentions so Discord actually pings. The 48h / 12h reminders
deliberately don't ping the role — they only ping silent drivers
individually.

Also extends discord-bot MessagePayload.allowed_mentions with the
roles[] field." || true
git push

echo "==> 5/5  Set SFL Cup discordRsvpRoleId (live DB)"
APPLY=1 npx tsx scripts/lm_set_sfl_rsvp_role_id.ts

echo ""
echo "Done. Next RSVP post for SFL will ping @SFL-Driver."
echo "If R8 Spa hasn't been posted yet, the next cron tick will pick it up,"
echo "or use 'Post now' in the admin RSVP page to fire it immediately."
