#!/usr/bin/env bash
# Deploy: live iRacing track typeahead on the Add / Edit round forms.
#
# What this ships:
#  1. Schema: new IracingTrack model (one row per track variant; indexed
#     by trackName). Additive — db push is safe.
#  2. Lib src/lib/iracing-api.ts — minimal auth + /data/track/get client.
#     Reads IRACING_EMAIL + IRACING_PASSWORD env vars; SHA-256 hashes
#     password, sends auth POST, forwards cookies on data calls. Follows
#     the S3 link transparently.
#  3. Server action refreshIracingTracks — admin-triggered upsert of the
#     full catalogue into IracingTrack.
#  4. Admin page /admin/iracing/tracks — "Refresh from iRacing" button,
#     shows total cached + last refresh time + first 20 tracks.
#  5. Cron route /api/cron/refresh-iracing-tracks + GitHub Actions
#     workflow (.github/workflows/cron-refresh-iracing-tracks.yml) for
#     weekly refresh.
#  6. Client component TrackSelect — typeahead suggestions from the
#     cache, dependent variants dropdown. Free-text fallback when the
#     typed track isn't in the catalogue (or when the cache is empty).
#  7. Add round form (/admin/.../rounds/new) and Edit round form
#     (/admin/.../rounds/[roundId]/edit) now use TrackSelect.
#
# Required env vars (set in Vercel → Project Settings → Environment
# Variables, AND in your local .env.local for development):
#   IRACING_EMAIL=you@example.com
#   IRACING_PASSWORD=your-iracing-password
#   CRON_SECRET=<already set for other crons; reused here>
#
# If iRacing demands captcha / MFA verification (sometimes happens on a
# fresh login from a new IP), log in once on members.iracing.com from
# Vercel's region — or just retry once you've cleared the prompt.
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_track_select.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: IracingTrack model)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/lib/iracing-api.ts \
  src/lib/iracing-tracks-cache.ts \
  src/lib/actions/iracing-tracks.ts \
  src/components/TrackSelect.tsx \
  "src/app/admin/iracing/tracks/page.tsx" \
  "src/app/api/cron/refresh-iracing-tracks/route.ts" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/new/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit/page.tsx" \
  .github/workflows/cron-refresh-iracing-tracks.yml \
  outputs/run_deploy_iracing_track_select.sh
git commit -m "Rounds: live iRacing track typeahead + variants dropdown

Add a TrackSelect client component used on Add / Edit round forms:

* Server-loaded IracingTrack catalogue feeds the typeahead suggestions.
* Picking a track auto-populates a dependent variants <select>.
* Cache empty / track not in catalogue → free-text fallback so the form
  is never blocked.

Infrastructure:

* New IracingTrack model (one row per track variant).
* src/lib/iracing-api.ts — minimal /data API client. Hashes password
  (SHA-256 of password+lowercased-email, base64), POSTs to /auth,
  forwards Set-Cookie on subsequent calls. Follows the S3 link from
  /data/track/get to fetch the actual JSON payload.
* Admin page /admin/iracing/tracks with manual 'Refresh from iRacing'
  button (calls server action refreshIracingTracks).
* Cron endpoint /api/cron/refresh-iracing-tracks + GitHub Actions
  workflow for weekly refresh (Sundays 04:00 UTC).

Required env vars on Vercel: IRACING_EMAIL, IRACING_PASSWORD, plus the
existing CRON_SECRET." || true
git push

echo "Done."
echo
echo "Next steps after this deploy succeeds:"
echo "  1. Set IRACING_EMAIL and IRACING_PASSWORD in Vercel (Settings ->"
echo "     Environment Variables) and trigger a redeploy."
echo "  2. Visit /admin/iracing/tracks and click 'Refresh from iRacing'."
echo "  3. Open the Add round page — the typeahead should now show"
echo "     suggestions as you type."
