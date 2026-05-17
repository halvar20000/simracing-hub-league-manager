#!/usr/bin/env bash
# Two-part fix for duplicate user records (admin-pre-registered + later
# Discord login = 2 User rows for the same person):
#
#  1) Deploy NextAuth signIn callback that auto-links a freshly-created
#     Discord User onto an existing admin-registered User with the same
#     first+last name (when there's exactly one match). Prevents future
#     duplicates.
#
#  2) Tells you how to run the one-off bulk-merge script for the
#     duplicates that already exist (Danny Platzer + however many others).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_user_merge.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/auth.ts \
  scripts/lm_merge_duplicate_users.ts \
  outputs/run_merge_duplicate_users.sh \
  outputs/run_deploy_user_merge.sh
git commit -m "Auth: auto-link Discord login onto matching admin-registered User

Add a signIn callback path that detects when a freshly-created Discord
User (no registrations / no incident reports / no approved relations)
matches exactly one existing User by normalised first+last name (or
displayName, or Discord global_name/username) AND that existing user
has no Discord Account yet. In that case, move the Account + Session
from the just-created user onto the matched user and delete the
duplicate. Failures are caught and silenced — sign-in never blocks.

Pairs the new auth path with scripts/lm_merge_duplicate_users.ts for
backfilling duplicates that already exist." || true
git push

echo ""
echo "Deploy pushed. Now fix the EXISTING duplicates (Danny Platzer + others):"
echo ""
echo "  1. Dry run (just lists pairs, no changes):"
echo "       bash outputs/run_merge_duplicate_users.sh"
echo ""
echo "  2. If the listed pairs look right, apply:"
echo "       APPLY=1 bash outputs/run_merge_duplicate_users.sh"
echo ""
echo "After that, each merged driver can RSVP/decline normally because"
echo "their Discord login now resolves to the User row that actually"
echo "holds the registration."
