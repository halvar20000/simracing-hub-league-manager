#!/usr/bin/env bash
# Deploy: raise Server Action body size limit from the 1 MB default to 10 MB
# so iRacing event-result JSON uploads (~3 MB for IEC rounds) don't get
# rejected with a 413 before the import action runs.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_body_size_limit.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  next.config.ts \
  outputs/run_deploy_body_size_limit.sh
git commit -m "next.config: raise Server Action bodySizeLimit to 10mb

iRacing event-result JSON for IEC rounds is ~3 MB (e.g. Watkins Glen).
The default 1 MB cap on Server Actions was rejecting uploads with a 413
before the import action could run. 10 MB gives comfortable headroom for
larger fields." || true
git push

echo "Done. Re-upload the IEC R6 Watkins Glen JSON."
