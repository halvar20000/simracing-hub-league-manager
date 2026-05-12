#!/usr/bin/env bash
# Add qualifying fields to RaceResult and have the iRLM importer populate them.
#
# Phase 1 (this script):
#   - schema.prisma: add qualifyingTimeMs Int? and startPosition Int? to RaceResult
#   - prisma db push: apply the change to your Neon DB
#   - irlm-import.ts: write the two new fields in upsert
#
# Phase 2 (after this works, separate change): surface the fields in the round
# page UI.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ----------------------------------------------------------------
# 1. Patch schema.prisma — add two fields to RaceResult
# ----------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'prisma/schema.prisma';
let s = fs.readFileSync(path, 'utf8');

const startToken = 'model RaceResult {';
const startIdx = s.indexOf(startToken);
if (startIdx < 0) {
  console.error('Could not find model RaceResult in schema.prisma');
  process.exit(1);
}
const endIdx = s.indexOf('}', startIdx);
if (endIdx < 0) {
  console.error('Could not find closing brace for RaceResult model');
  process.exit(1);
}
const block = s.slice(startIdx, endIdx);

let added = 0;
let inserts = '';
if (!/qualifyingTimeMs\s+Int\?/.test(block)) {
  inserts += '  qualifyingTimeMs Int?\n';
  added++;
}
if (!/startPosition\s+Int\?/.test(block)) {
  inserts += '  startPosition    Int?\n';
  added++;
}

if (added === 0) {
  console.log('Both qualifying fields already present — no schema change needed.');
} else {
  // Insert just before the closing brace of the RaceResult model.
  const newSchema = s.slice(0, endIdx) + inserts + s.slice(endIdx);
  fs.writeFileSync(path, newSchema);
  console.log(\`Added \${added} field(s) to RaceResult.\`);
}
"

# ----------------------------------------------------------------
# 2. Apply the schema change to Neon (db push, no migration files)
# ----------------------------------------------------------------
echo ""
echo "=== Running prisma db push ==="
npx prisma db push

echo ""
echo "=== Regenerating Prisma client ==="
npx prisma generate

# ----------------------------------------------------------------
# 3. Patch irlm-import.ts to populate qualifyingTimeMs + startPosition
# ----------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'src/lib/actions/irlm-import.ts';
let s = fs.readFileSync(path, 'utf8');

// (a) Compute qualifyingTimeMs and startPosition before the upsert.
// Insert just before the prisma.raceResult.upsert call.
const before = '  const iRating = typeof row.newIrating === \"number\" ? row.newIrating : null;';
const inject  = \`  const iRating = typeof row.newIrating === \"number\" ? row.newIrating : null;
  const qualifyingTimeMs = durationToMs(row.qualifyingTime);
  const startPositionRaw = Number(row.startPosition ?? 0);
  const startPosition =
    Number.isFinite(startPositionRaw) && startPositionRaw > 0
      ? Math.round(startPositionRaw)
      : null;\`;

if (s.includes('const qualifyingTimeMs')) {
  console.log('qualifyingTimeMs already declared in irlm-import.ts');
} else {
  if (!s.includes(before)) {
    console.error('Could not find anchor line for injecting qualifying vars.');
    process.exit(1);
  }
  s = s.replace(before, inject);
  console.log('Injected qualifying var declarations.');
}

// (b) Add the new fields into create + update payloads of the upsert.
// We expect 'iRating,' to appear twice (once in create, once in update).
const re = /(\\biRating,\\n)/g;
const matches = [...s.matchAll(re)];
if (matches.length === 0) {
  console.error('Could not find iRating field in upsert payloads.');
  process.exit(1);
}
if (s.includes('qualifyingTimeMs,') && s.includes('startPosition,')) {
  console.log('Upsert payloads already include qualifying fields.');
} else {
  s = s.replace(/(\\biRating,\\n)/g, '\$1      qualifyingTimeMs,\\n      startPosition,\\n');
  console.log('Added qualifyingTimeMs + startPosition to upsert create + update.');
}

fs.writeFileSync(path, s);
"

echo ""
echo "=== Sanity check ==="
echo "First line of irlm-import.ts:"
head -1 src/lib/actions/irlm-import.ts
echo ""
echo "Confirm new fields are referenced:"
grep -n 'qualifyingTimeMs' src/lib/actions/irlm-import.ts || echo "  MISSING"
grep -n 'startPosition' src/lib/actions/irlm-import.ts || echo "  MISSING"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Add qualifyingTimeMs + startPosition to RaceResult, populate from iRLM"
git push

echo ""
echo "Done. Wait ~60s for Vercel, then click 'Pull from iRLM' again on the round."
echo "The two new fields will be populated on every imported race result."
echo ""
echo "Phase 2 (UI): once you've confirmed the data is in the DB, tell me and I'll"
echo "add a Quali / Grid column to the round page and (optionally) the standings."
