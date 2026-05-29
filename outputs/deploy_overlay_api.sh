#!/usr/bin/env bash
# Deploy the new /api/overlay/* endpoints (standings + leagues) used by the
# iRacing championship OBS overlay. Run this in the Mac Terminal from anywhere.
#
#   bash ~/Library/CloudStorage/Nextcloud-admin@cloud․smarthomeworld68․fr/AI/league-manager/outputs/deploy_overlay_api.sh
#
# (The path contains unusual Unicode dots in "smarthomeworld68․fr" — that's
# intentional, that's how the Nextcloud sync named the folder.)
set -e

PROJECT="$HOME/Library/CloudStorage/Nextcloud-admin@cloud․smarthomeworld68․fr/AI/league-manager"
cd "$PROJECT"

echo "==> Skipping local typecheck — Vercel will typecheck during its build."
echo "    (Nextcloud doesn't sync node_modules symlinks, so local tsc is unreliable."
echo "     If Vercel rejects the build, the deploy log will tell us exactly what's wrong.)"

echo "==> git add …"
git add -A src/app/api/overlay outputs/deploy_overlay_api.sh

echo "==> git commit …"
git commit -m "Add /api/overlay/{standings,leagues} for iRacing championship overlay

- Public, read-only, CORS-open endpoints consumed by the new
  iracing_championship.py OBS overlay on the streaming PC.
- standings: pre-race championship rows + scoring table +
  per-driver iRacing customer IDs (User.iracingMemberId) so the
  overlay can match telemetry drivers and project post-race points.
- leagues: list of leagues with their currently runnable seasons,
  used by the overlay's config picker page."

echo "==> git push (will trigger Vercel deploy) …"
git push

echo
echo "Done. Vercel will rebuild in ~1-2 minutes."
echo "Test once deployed:"
echo "  curl 'https://league.simracing-hub.com/api/overlay/leagues' | jq"
echo "  curl 'https://league.simracing-hub.com/api/overlay/standings?league=cas-gt3-wct' | jq"
