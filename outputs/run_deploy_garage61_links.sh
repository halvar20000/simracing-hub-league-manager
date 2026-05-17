#!/usr/bin/env bash
# Deploy: Level 1 Garage 61 integration — pure cross-linking, no API calls.
#
# Schema:
#  - User.garage61Url     String?  — driver's own Garage 61 profile URL
#  - League.garage61TeamUrl String? — league's Garage 61 team URL
#
# UI:
#  - /profile gets a new "Garage 61 profile URL" field (with URL
#    validation — must start with https://garage61.net/).
#  - /admin/leagues/[slug]/edit gets a "Garage 61 team URL (optional)"
#    field next to the Twitch URL field.
#  - Public season page (/leagues/[slug]/seasons/[seasonId]) shows a
#    "<League> on Garage 61 →" button when the league has a team URL set.
#  - Public roster + admin roster (solo + team layouts) show a small
#    "G61" badge inline next to drivers who have a profile URL.
#
# New component: src/components/Garage61Link.tsx (badge + button variants;
# renders nothing when url is null/empty so callers can drop it in safely).
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_garage61_links.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: 2 nullable columns)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/components/Garage61Link.tsx \
  src/lib/actions/profile.ts \
  src/lib/actions/leagues.ts \
  src/app/profile/page.tsx \
  "src/app/admin/leagues/[slug]/edit/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_garage61_links.sh
git commit -m "Garage 61: Level 1 cross-linking

Two new optional fields:
* User.garage61Url      — driver's profile URL
* League.garage61TeamUrl — league's Garage 61 team URL

Wired into:
* /profile form (URL validated against https://garage61.net/)
* /admin/leagues/[slug]/edit (validated server-side too)
* Public season page header — shows '<League> on Garage 61 →' button
* Public + admin roster pages — small 'G61' badge inline next to
  drivers who set a profile URL (renders nothing otherwise)

New reusable component src/components/Garage61Link.tsx with badge +
button variants. No API calls, no OAuth — purely manual links." || true
git push

echo "Done."
