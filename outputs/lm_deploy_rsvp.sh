#!/usr/bin/env bash
# Ship the Discord RSVP feature.
#
# RUN ORDER:
#   1) bash outputs/lm_db_push_rsvp.sh   (additive schema push — MUST run first)
#   2) Set env vars on Vercel:
#        DISCORD_BOT_TOKEN       (bot token from Developer Portal)
#        DISCORD_PUBLIC_KEY      (hex public key from Developer Portal)
#        DISCORD_APPLICATION_ID  (app ID from Developer Portal)
#   3) bash outputs/lm_deploy_rsvp.sh    (this script)
#   4) In Discord Developer Portal → General Information → set
#        "Interactions Endpoint URL" to:
#        https://league.simracing-hub.com/api/discord/interactions
#      Discord will PING the URL — you'll see a green "Saved" only if
#      our endpoint verified the signature.
#   5) Add the bot to the server with OAuth URL:
#        https://discord.com/api/oauth2/authorize?client_id=<APP_ID>&scope=bot%20applications.commands&permissions=18432
#      Permissions 18432 = Send Messages + Embed Links.
#   6) Admin → League edit → set Discord Guild ID + RSVP channel ID +
#      "Post N days before" on each league you want to enable.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> typecheck"
npx tsc --noEmit -p tsconfig.json

echo "==> git status"
git status

echo "==> git add -A"
git add -A

echo "==> commit"
git commit -m "feat(rsvp): Discord per-round RSVP bot + no-show penalty (GT3 WCT)

- New models: RoundRsvp, RoundDiscordRsvpMessage
- New enums: RsvpStatus, RsvpSource; new PenaltySource value NO_RSVP_NO_SHOW
- League: discordGuildId, discordRsvpChannelId, rsvpDaysBefore
- Round: rsvpNotifiedAt, rsvpReminder48hAt, rsvpReminder12hAt

- src/lib/discord-bot.ts: bot-token REST helpers (post/edit/delete)
- src/lib/discord-rsvp-embed.ts: canonical embed + buttons builder
- src/lib/rsvp.ts: pure upsertRsvp + refreshDiscordRsvpMessage + summary
- src/lib/notify-rsvp.ts: idempotent per-round message poster
- src/lib/notify-rsvp-reminder.ts: 48h / 12h reminder pings to silent drivers
- src/lib/no-rsvp-penalty.ts: 1-pt POINTS_DEDUCTION for silent no-shows (GT3 WCT only)
- src/lib/penalty-pool.ts: walk penalty-bearing rounds in addition to entered rounds,
  so NO_RSVP_NO_SHOW penalties correctly reset the clean-race counter

- src/app/api/discord/interactions/route.ts: Ed25519-verified interactions endpoint
- src/app/api/cron/post-rsvp/route.ts: posts RSVP messages N days before each round
- src/app/api/cron/rsvp-reminders/route.ts: 48h + 12h pings to silent drivers
- src/lib/actions/rsvp.ts: server actions (driver submit, admin post / refresh)
- src/lib/actions/rounds.ts: applyNoRsvpNoShowPenalties hook in updateRound
- src/lib/actions/leagues.ts: persist Discord guild/channel/days-before

- src/components/RsvpWidget.tsx: driver-side widget on public round page
- src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/rsvp/page.tsx:
  admin per-round overview with tallies and driver lists
- src/app/admin/leagues/[slug]/edit/page.tsx: UI to configure Discord channel + days-before

- .github/workflows/cron-post-rsvp.yml: every 30 min
- .github/workflows/cron-rsvp-reminders.yml: every 30 min" || echo "nothing to commit"

echo "==> push"
git push

echo
echo "Vercel will deploy automatically on push. Once it's live:"
echo "  - Set Interactions Endpoint URL in Discord (step 4 above)"
echo "  - Configure each league's RSVP channel (step 6)"
