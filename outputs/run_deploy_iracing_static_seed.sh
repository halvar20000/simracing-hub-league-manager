#!/usr/bin/env bash
# Deploy: switch the iRacing track catalogue to a static seed file.
#
# Why: iRacing retired the legacy email+password /data API auth in their
# December 2025 season release. The OAuth2 replacement requires a
# registered client ID, and iRacing has paused new client registrations
# while they review third-party usage. So the live refresh path can't
# work right now — falling back to a curated static JSON.
#
# What changes:
#  - NEW: src/data/iracing-tracks.json (~100 GT3 / road-racing tracks
#    with their main variants). Edit this file to add more tracks.
#  - src/lib/actions/iracing-tracks.ts is rewritten to seed from the
#    JSON instead of calling the live API. Same admin button on
#    /admin/iracing/tracks, relabelled "Seed from JSON".
#  - /admin/iracing/tracks help text updated to explain the situation.
#
# DELETED (live API is currently unusable, so dead code goes):
#  - src/lib/iracing-api.ts
#  - src/app/api/cron/refresh-iracing-tracks/route.ts
#  - .github/workflows/cron-refresh-iracing-tracks.yml
#
# The schema (IracingTrack model) stays exactly as-is, so when iRacing
# reopens OAuth client registration we can flip the data source back
# without another migration.
#
# IRACING_EMAIL + IRACING_PASSWORD env vars on Vercel are no longer
# read by anything in the codebase, but feel free to leave them set
# in case we re-enable the live path later.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_static_seed.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  git rm dead live-API files"
git rm -f --ignore-unmatch \
  src/lib/iracing-api.ts \
  "src/app/api/cron/refresh-iracing-tracks/route.ts" \
  .github/workflows/cron-refresh-iracing-tracks.yml

# Belt-and-braces: also drop from disk if git rm couldn't find them.
rm -rf src/lib/iracing-api.ts \
       "src/app/api/cron/refresh-iracing-tracks" \
       .github/workflows/cron-refresh-iracing-tracks.yml

echo "==> 2/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 3/4  Stage new + modified files"
git add \
  src/data/iracing-tracks.json \
  src/lib/actions/iracing-tracks.ts \
  "src/app/admin/iracing/tracks/page.tsx" \
  outputs/run_deploy_iracing_static_seed.sh

echo "==> 4/4  Commit + push"
git commit -m "iRacing tracks: switch to static JSON seed (live API retired)

iRacing retired legacy email+password /data API auth in December 2025.
Their OAuth2 replacement requires a registered client ID and new
client registrations are currently paused — so there's no live path
right now.

Switching the data source to a curated src/data/iracing-tracks.json
(~100 GT3 / road-racing tracks + main variants). The admin
refreshIracingTracks action now seeds from this file via upsert keyed
on iracingTrackId. /admin/iracing/tracks button relabelled 'Seed from
JSON' and the help text explains the situation.

Deleted dead live-API files:
* src/lib/iracing-api.ts
* src/app/api/cron/refresh-iracing-tracks/route.ts
* .github/workflows/cron-refresh-iracing-tracks.yml

Schema (IracingTrack model) untouched — when iRacing reopens OAuth
client registration we can flip the data source back without another
migration." || true

git push

echo "Done."
echo
echo "Next: visit /admin/iracing/tracks and click 'Seed from JSON' to"
echo "populate the cache. The Add Round form's typeahead will work as"
echo "soon as the cache has rows."
