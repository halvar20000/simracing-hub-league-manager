#!/usr/bin/env bash
# Fix: stream-announcement upload was failing with "this page couldn't load".
# Two likely root causes are now both addressed:
#   - Bump Server Action bodySizeLimit 10mb -> 25mb (large PNG posters)
#   - Action MAX_BYTES 8 MB -> 20 MB
#   - Wrap @vercel/blob put() in try/catch so a missing Blob token redirects
#     with a helpful message instead of crashing the page
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_stream_upload_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  next.config.ts \
  src/lib/actions/stream-announcements.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/stream/page.tsx" \
  outputs/run_deploy_stream_upload_fix.sh
git commit -m "Stream upload: 25mb body limit, 20 MB image cap, graceful Blob errors

- next.config bodySizeLimit raised 10mb -> 25mb (full-res PNG posters
  routinely hit 10-15 MB; 25 MB gives comfortable headroom).
- Action MAX_BYTES raised 8 MB -> 20 MB to match.
- @vercel/blob put() wrapped in try/catch with a friendly redirect.
  Specifically detects 'no BLOB_READ_WRITE_TOKEN' and tells the admin
  to create the Blob store in Vercel -> Storage." || true
git push

echo ""
echo "Done. After Vercel deploys, retry the save. Make sure the Vercel"
echo "Blob store exists (Vercel dashboard -> Storage -> Create Blob)."
echo "Vercel auto-injects BLOB_READ_WRITE_TOKEN once the store exists."
