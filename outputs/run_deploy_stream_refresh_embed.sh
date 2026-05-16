#!/usr/bin/env bash
# Deploy: "Refresh embed" button on the admin stream-announcement page.
# Edits the existing Discord message in place with the current poster /
# message text / Twitch URL / schedule time. Complements the existing
# "Post now" button (which posts a NEW message instead).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_stream_refresh_embed.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/notify-stream.ts \
  src/lib/actions/stream-announcements.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/stream/page.tsx" \
  outputs/run_deploy_stream_refresh_embed.sh
git commit -m "Stream announcement: 'Refresh embed' button on admin page

Adds refreshStreamAnnouncement helper that edits the already-posted
Discord message in place with the current data (poster, message text,
Twitch URL, schedule time). Server action refreshStreamEmbed + a
disabled-when-not-posted button on the admin stream page.

Use 'Post now' to post a new message, 'Refresh embed' to update the
existing one without creating a duplicate. Idempotent." || true
git push

echo "Done."
