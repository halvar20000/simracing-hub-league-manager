#!/usr/bin/env bash
# Deploy: make Car.carClassId optional so cars can be season-wide and
# shared across driver classes. This fixes the GT3 WCT pain point where
# adding the same 11 cars under PRO and AM means duplicate work.
#
# What this does:
#   1) prisma db push       — make `Car.carClassId` nullable on Neon
#                            (additive, safe; uses SetNull on CarClass delete)
#   2) prisma generate      — refresh the typed Prisma client
#   3) tsc --noEmit         — full type-check
#   4) git commit + push    — Vercel auto-deploys main
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot, not
# the office WiFi (which blocks 5432).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_season_wide_cars.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: Car.carClassId → nullable)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/lib/actions/cars.ts \
  src/lib/actions/registrations.ts \
  src/lib/actions/iracing-json-import.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx" \
  outputs/run_deploy_season_wide_cars.sh
git commit -m "Cars: make carClassId optional → season-wide shared cars

Problem: on GT3 WCT (PRO + AM) admins had to add every car twice — once
under PRO, once under AM — because Car was pinned to a single CarClass.

Fix: Car.carClassId is now nullable. Cars with carClassId=NULL are
'shared' / season-wide and selectable from every driver class.

* Schema: Car.carClassId String?  + relation onDelete: SetNull
* Manage Cars: new 'Shared cars (any class)' section at the top of
  /admin/leagues/[slug]/seasons/[seasonId]/cars
* addCarsBulk accepts either carClassId (per-class) or seasonId only
  (shared)
* Register page merges shared cars into every class's car list
* createRegistration / createTeamRegistration accept shared cars for any
  selected class (carClassId NULL is universally valid)
* iRacing JSON importer auto-creates new cars as shared (NULL) instead
  of guessing a class
* Copy-from-previous-season also copies shared cars

Existing class-pinned cars are unaffected." || true
git push

echo "Done."
