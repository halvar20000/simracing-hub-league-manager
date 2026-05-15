#!/usr/bin/env bash
# Deploy: per-league discordEmbedColor for RSVP embeds. SFL gets pink
# (#EB459E); other leagues fall back to the orange default until set.
#
# Steps:
#   1. prisma db push  — adds League.discordEmbedColor column
#   2. prisma generate — refreshes typed client
#   3. tsc check
#   4. git commit + push (Vercel auto-deploys)
#   5. Set SFL = #EB459E
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_embed_color.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/5  prisma db push  (adds discordEmbedColor column)"
npx prisma db push

echo "==> 2/5  prisma generate"
npx prisma generate

echo "==> 3/5  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/5  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/lib/discord-rsvp-embed.ts \
  src/lib/notify-rsvp.ts \
  src/lib/rsvp.ts \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  src/lib/actions/leagues.ts \
  scripts/lm_set_sfl_embed_color.ts \
  outputs/run_deploy_embed_color.sh
git commit -m "RSVP: per-league embed color (League.discordEmbedColor)

Add an optional hex-color field to League and surface it in the admin
edit form. notify-rsvp + rsvp.refreshDiscordRsvpMessage pass it through
to the embed builder, which parses '#RRGGBB' or 'RRGGBB' and falls back
to the orange default (0xff6b35) when unset or malformed. Action sanitises
the input — invalid strings store as null." || true
git push

echo "==> 5/5  Set SFL Cup discordEmbedColor = #EB459E (live DB)"
APPLY=1 npx tsx scripts/lm_set_sfl_embed_color.ts

echo ""
echo "Done. After Vercel finishes redeploying, click 'Refresh embed' on the"
echo "SFL R8 RSVP post — the side-bar will turn pink. For other leagues, set"
echo "the hex on /admin/leagues/<slug>/edit (or leave blank for orange)."
