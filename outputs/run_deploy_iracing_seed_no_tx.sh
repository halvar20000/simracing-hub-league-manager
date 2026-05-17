#!/usr/bin/env bash
# Hot-fix: drop the $transaction wrapper around the iRacing track seed
# loop. 100 sequential upserts over Neon's pooler can blow past the
# default 5-second interactive-transaction timeout. Each upsert is
# independent + idempotent, so no transaction is needed — re-running
# the seed just retries any missing rows. The error now also surfaces
# how many rows did succeed before failure (?ok=N&error=...).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_seed_no_tx.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/actions/iracing-tracks.ts \
  outputs/run_deploy_iracing_seed_no_tx.sh
git commit -m "iRacing tracks seed: drop \$transaction wrapper

100 sequential upserts over Neon's pooler exceeds the default 5 s
interactive-transaction timeout (\"Transaction not found ... refers to
an old closed transaction\"). Each upsert is idempotent and
independent, so no transaction is needed — and re-running the seed on
partial failure just fills in whatever's missing.

The catch handler now reports how many rows did succeed before the
failure (?ok=N&error=...) so the admin can see progress." || true
git push

echo "Done. After deploy, click 'Seed from JSON' on /admin/iracing/tracks."
