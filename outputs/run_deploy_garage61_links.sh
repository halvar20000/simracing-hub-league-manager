#!/usr/bin/env bash
# Deploy: Level 1 Garage 61 integration (team-URL-only edition).
#
# Schema:
#  - League.garage61TeamUrl String?  — paste the league's Garage 61 team
#    URL once per league; shown as a button on the public season page.
#
# Garage 61 doesn't have stable public driver-profile URLs (the app uses
# logged-in /app/* paths), so we DON'T add a per-driver field. Team URLs
# work for team members because clicking lands them in the right place
# inside the Garage 61 app.
#
# UI:
#  - /admin/leagues/[slug]/edit gets a "Garage 61 team URL (optional)"
#    field next to the Twitch URL field, with helper text.
#  - Public season page (/leagues/[slug]/seasons/[seasonId]) shows a
#    "<League> on Garage 61 →" button when the league has a team URL set.
#
# New component: src/components/Garage61Link.tsx (badge + button
# variants; renders nothing when url is null/empty).
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_garage61_links.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: League.garage61TeamUrl)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/components/Garage61Link.tsx \
  src/lib/actions/leagues.ts \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx" \
  outputs/run_deploy_garage61_links.sh
git commit -m "Garage 61: Level 1 cross-linking (team URL only)

Adds League.garage61TeamUrl plus a button on the public season page.

Garage 61 has no stable public driver-profile URL (the app is all
logged-in /app/* paths), so no per-driver field — adding one would
just create broken links for team members and outsiders alike.
Drivers click the league's team button and land inside Garage 61 if
they're team members.

New reusable component src/components/Garage61Link.tsx (badge + button
variants), kept for future use even though only the button is wired
up right now." || true
git push

echo "Done."
