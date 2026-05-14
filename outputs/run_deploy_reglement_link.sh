#!/usr/bin/env bash
# Update the "CAS Regulations" footer link to point to the new German
# Reglement doc (id 1-PSzsVuO72ibGj0ioXDoHIMyehA5lOsn9LVuo5vI2M8, tab t.os392vq0z8ib).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_reglement_link.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add src/components/footer.tsx outputs/run_deploy_reglement_link.sh
git commit -m "Footer: point CAS Regulations link at new German doc" || true
git push

echo "Done."
