#!/usr/bin/env bash
# Push the RSVP-related schema changes to Neon.
#
# WHAT THIS DOES (additive only — safe to re-run):
#   - Adds models RoundRsvp, RoundDiscordRsvpMessage
#   - Adds enums RsvpStatus, RsvpSource
#   - Adds value NO_RSVP_NO_SHOW to PenaltySource enum
#   - Adds League.discordGuildId, League.discordRsvpChannelId, League.rsvpDaysBefore
#   - Adds Round.rsvpNotifiedAt, Round.rsvpReminder48hAt, Round.rsvpReminder12hAt
#
# NEVER run `prisma migrate dev` here — see CLAUDE.md, Neon's actual schema
# state does not match prisma/migrations/ and reset would wipe data.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> npx prisma db push (no migration history)"
npx prisma db push --skip-generate

echo "==> npx prisma generate (refresh typed client)"
npx prisma generate

echo
echo "Done. Next: bash outputs/lm_deploy_rsvp.sh to ship the code."
