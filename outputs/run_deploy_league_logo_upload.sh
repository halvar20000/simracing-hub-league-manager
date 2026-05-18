#!/usr/bin/env bash
# Deploy: upload-a-logo support on the league create + edit pages.
#
# - createLeague + updateLeague now accept an optional `logoFile`
#   form field. On submit the file is uploaded to Vercel Blob
#   (league-logos/<slug>.<timestamp>.<ext>) and the public URL is
#   stored in League.logoUrl. Accepts PNG / JPG / WebP / SVG / GIF
#   up to 5 MB. On error the action redirects back with a friendly
#   message.
# - New League page gets a file <input> + helper text.
# - Edit League page gets the same plus a preview of the current
#   logo and a "Remove on save" checkbox. When a new file is
#   uploaded and an old logoUrl existed, the action does a
#   best-effort del() of the previous blob.
#
# Reuses the same Vercel Blob setup as the stream-announcement
# posters and season schedule images — no new infrastructure
# needed (BLOB_READ_WRITE_TOKEN is already injected).
#
# No DB / schema changes (the logoUrl field already exists).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_league_logo_upload.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/actions/leagues.ts \
  "src/app/admin/leagues/new/page.tsx" \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  outputs/run_deploy_league_logo_upload.sh
git commit -m "Leagues: upload logo on create / edit (Vercel Blob)

createLeague + updateLeague now accept an optional logoFile form
field. Helper uploadLogoIfProvided() validates (PNG/JPG/WebP/SVG/GIF
≤ 5 MB), uploads to Vercel Blob at
league-logos/<slug>.<timestamp>.<ext>, and returns the public URL.

UI:
* New League page: file <input> + helper text.
* Edit League page: same input + preview of the current logo and a
  'Remove on save' checkbox. When a new file is uploaded, the old
  blob is best-effort deleted.

Existing logoUrl field on League is unchanged — only the data path
into it is new." || true
git push

echo "Done."
