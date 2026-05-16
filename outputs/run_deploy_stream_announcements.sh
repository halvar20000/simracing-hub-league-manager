#!/usr/bin/env bash
# Deploy: per-round Twitch stream announcement bot.
#
# Adds:
#   - League.discordStreamChannelId + League.twitchUrl
#   - StreamAnnouncement model (1:1 with Round) with posterBlobUrl,
#     scheduledAt, postedAt, twitchUrl override, messageText, etc.
#   - Admin form at /admin/leagues/.../rounds/.../stream
#   - Cron /api/cron/post-stream-announcements + GitHub Actions every 10 min
#   - Server actions for create/update/delete/postNow with Vercel Blob
#     uploads for the poster image
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_stream_announcements.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
#
# AFTER this deploy you also need to (one-time):
#   1. In Vercel dashboard → Storage → Create Blob store
#      (name doesn't matter — Vercel auto-injects BLOB_READ_WRITE_TOKEN)
#   2. On the admin league-edit page, set "Stream channel ID" + the default
#      Twitch URL for each league that will use the feature
#   3. On any round, visit /admin/leagues/<slug>/seasons/<season>/rounds/<id>/stream
#      and create the announcement (upload poster, pick datetime, save)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/5  Install @vercel/blob"
npm install @vercel/blob

echo "==> 2/5  prisma db push (adds League fields + StreamAnnouncement table)"
npx prisma db push

echo "==> 3/5  prisma generate"
npx prisma generate

echo "==> 4/5  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 5/5  Commit + push (Vercel auto-deploys main)"
git add -A \
  prisma/schema.prisma \
  src/lib/discord-bot.ts \
  src/lib/discord-stream-embed.ts \
  src/lib/notify-stream.ts \
  src/lib/actions/stream-announcements.ts \
  src/lib/actions/leagues.ts \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/stream/page.tsx" \
  src/app/api/cron/post-stream-announcements/route.ts \
  .github/workflows/cron-post-stream.yml \
  package.json package-lock.json \
  outputs/run_deploy_stream_announcements.sh
git commit -m "Stream announcement bot — schedule a Twitch stream post per round

Adds:
  - League.discordStreamChannelId + League.twitchUrl (admin form
    fields next to the existing RSVP settings)
  - StreamAnnouncement model (1:1 with Round) with posterBlobUrl,
    scheduledAt, postedAt, twitchUrl override, messageText, and a
    snapshot of the posted Discord message for later edit/delete.
  - Vercel Blob upload pipeline for the poster image (PNG/JPG/WebP/
    GIF, max 8 MB).
  - Admin page /admin/leagues/.../rounds/.../stream with form + status
    + 'Post now' button + 'Danger zone' delete (also drops the Discord
    message and the blob).
  - Cron endpoint /api/cron/post-stream-announcements and GitHub
    Actions workflow that polls every 10 min, fires anything due, and
    is idempotent via StreamAnnouncement.postedAt.
  - notify-stream.ts:postStreamAnnouncement mirrors the RSVP pattern;
    embed includes the Twitch URL as a clickable title + a real link
    button, the poster as the embed image, and Discord native
    timestamps for both the stream and the race start.
  - Extends MessagePayload.allowed_mentions with roles[] and adds the
    Component.url field for link buttons." || true
git push

echo ""
echo "Deploy pushed."
echo ""
echo "One-time setup (do these once, in this order):"
echo "  1. Vercel dashboard → Storage → Create Blob store (any name)."
echo "     Vercel auto-injects BLOB_READ_WRITE_TOKEN into the project."
echo "  2. For each league that will use stream announcements, edit the"
echo "     league: /admin/leagues/<slug>/edit"
echo "       - Stream channel ID = the Discord channel for stream posts"
echo "       - Default Twitch URL = your league's Twitch channel"
echo "  3. Per round: /admin/leagues/<slug>/seasons/<id>/rounds/<rid>/stream"
echo "       - Upload poster, set scheduled time, save."
echo "       - The bot will post within ~10 min of the scheduled time."
echo "       - 'Post now' triggers immediately."
