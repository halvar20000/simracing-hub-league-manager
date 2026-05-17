#!/usr/bin/env bash
# Deploy: replace placeholder emails with real ones in two places.
#
#  1) signIn callback: on every Discord login, if the User's current
#     email matches iracing-NNNN@imported.simracing-hub.com, overwrite
#     it with the email Discord supplies in profile.email. Catches the
#     already-merged users (Holger, Danny) next time they log in.
#
#  2) merge script: when merging duplicates, if the admin user's email
#     is a placeholder and the Discord user has a real one, transfer it
#     before deleting the Discord row.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_email_replace_placeholder.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/auth.ts \
  scripts/lm_merge_duplicate_users.ts \
  outputs/run_deploy_email_replace_placeholder.sh
git commit -m "Auth + merge: replace placeholder email with real one

- signIn callback: on every Discord login, swap a placeholder
  iracing-NNNN@imported.simracing-hub.com email for profile.email.
- Merge script: when consolidating duplicate users, transfer the
  Discord user's real email onto the admin user if admin's email is
  a placeholder. Clears the Discord row's email first to satisfy
  the User.email unique constraint, then deletes the Discord row." || true
git push

echo ""
echo "Already-merged drivers (Holger, Danny) will get their real email"
echo "automatically on their next Discord login. No script needed for them."
