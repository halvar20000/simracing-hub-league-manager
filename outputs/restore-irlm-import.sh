#!/usr/bin/env bash
# The pullResultsFromIRLM import was lost from the round page during an earlier patch.
# That is why <form action={pullResultsFromIRLM}> renders as javascript:throw —
# the function is undefined at render time, so React falls into its safety net.
# This script restores the import.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "BEFORE — current imports:"
grep -n '^import ' "$PAGE" | head -20
echo ""

if grep -q 'pullResultsFromIRLM' "$PAGE"; then
  echo "pullResultsFromIRLM is already referenced somewhere in the file — checking for the import line..."
fi

if grep -q 'from "@/lib/actions/irlm-import"' "$PAGE"; then
  echo "Import already present. Nothing to do."
else
  # Insert after the upsertRaceResult import so it sits with the other action imports.
  node -e "
const fs = require('fs');
const path = '$PAGE';
let s = fs.readFileSync(path, 'utf8');

const needle = 'import { upsertRaceResult } from \"@/lib/actions/race-results\";';
if (!s.includes(needle)) {
  console.error('Could not find upsertRaceResult import as anchor.');
  process.exit(1);
}

const replacement = needle + '\nimport { pullResultsFromIRLM } from \"@/lib/actions/irlm-import\";';
s = s.replace(needle, replacement);
fs.writeFileSync(path, s);
console.log('Restored pullResultsFromIRLM import.');
"
fi

echo ""
echo "AFTER — imports now:"
grep -n '^import ' "$PAGE" | head -20

echo ""
echo "Sanity check — make sure the form still references the action:"
grep -n 'pullResultsFromIRLM' "$PAGE" || echo "  WARNING: form does not reference pullResultsFromIRLM"

echo ""
echo "Push:"
echo "  git add -A && git commit -m 'Restore missing pullResultsFromIRLM import' && git push"
