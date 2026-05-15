#!/usr/bin/env bash
# Deploy: admin league-edit page now has an "RSVP role ID" input next to
# the channel ID. The role is included in the initial RSVP post as a
# Discord @-mention. Each league configures its own role independently.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_rsvp_role_admin_ui.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  src/lib/actions/leagues.ts \
  outputs/run_deploy_rsvp_role_admin_ui.sh
git commit -m "Admin league edit: add 'RSVP role ID' field

Per-league input for League.discordRsvpRoleId (already in schema). When
set, the initial RSVP post @mentions this Discord role. Empty = no
role mention. Action parses the new field and includes it in the
prisma update." || true
git push

echo ""
echo "Done. Visit /admin/leagues/<slug>/edit on each league and paste the"
echo "appropriate Discord role ID. Leave blank to disable role pings."
