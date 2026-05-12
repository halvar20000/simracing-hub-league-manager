#!/usr/bin/env bash
# Phase 2: surface qualifyingTimeMs + startPosition in the admin round UI,
# and let the existing "Save row" form persist them.
#
# Touches:
#   src/lib/actions/race-results.ts  (parse + persist two new fields)
#   src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx
#     - extend the raceResults row TypeScript type
#     - add a "Grid" <Field> after Position
#     - add a "Quali" <Field> after Best lap

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

ACTION='src/lib/actions/race-results.ts'
PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

# ---------------------------------------------------------------
# 1. Extend upsertRaceResult to parse + persist the two fields.
# ---------------------------------------------------------------
node -e "
const fs = require('fs');
let s = fs.readFileSync('$ACTION', 'utf8');

// (a) Add parsing block just after the bestLapTimeMs parsing.
const anchor = 'const bestLapTimeMs = parseTimeToMs(\n    String(formData.get(\"bestLapTime\") ?? \"\")\n  );';
const inject  = anchor + \`
  const startPositionRaw = String(formData.get(\"startPosition\") ?? \"\").trim();
  const startPosition = startPositionRaw
    ? parseInt(startPositionRaw, 10) || null
    : null;
  const qualifyingTimeMs = parseTimeToMs(
    String(formData.get(\"qualifyingTime\") ?? \"\")
  );\`;

if (s.includes('const startPositionRaw = String(formData.get(\"startPosition\")')) {
  console.log('race-results.ts: parsing already present.');
} else {
  if (!s.includes(anchor)) {
    console.error('Could not find bestLapTimeMs anchor in race-results.ts');
    process.exit(1);
  }
  s = s.replace(anchor, inject);
  console.log('race-results.ts: parsing block added.');
}

// (b) Add the new fields to the data object passed to upsert.
const dataAnchor = '    bestLapTimeMs,\n    incidents,';
const dataReplace = '    bestLapTimeMs,\n    startPosition,\n    qualifyingTimeMs,\n    incidents,';
if (s.includes('startPosition,\n    qualifyingTimeMs,')) {
  console.log('race-results.ts: data object already updated.');
} else {
  if (!s.includes(dataAnchor)) {
    console.error('Could not find data object anchor in race-results.ts');
    process.exit(1);
  }
  s = s.replace(dataAnchor, dataReplace);
  console.log('race-results.ts: data object updated.');
}

fs.writeFileSync('$ACTION', s);
"

# ---------------------------------------------------------------
# 2. Round page: extend type + add two <Field> entries.
# ---------------------------------------------------------------
node -e "
const fs = require('fs');
let s = fs.readFileSync('$PAGE', 'utf8');

// (a) Extend the raceResults row TypeScript type. Anchor: incidents: number;
const typeAnchor = '      incidents: number;';
const typeReplace =
  '      incidents: number;\n' +
  '      startPosition: number | null;\n' +
  '      qualifyingTimeMs: number | null;';

if (s.includes('startPosition: number | null;\n      qualifyingTimeMs:')) {
  console.log('page.tsx: type already extended.');
} else {
  if (!s.includes(typeAnchor)) {
    console.error('Could not find incidents type anchor in page.tsx');
    process.exit(1);
  }
  s = s.replace(typeAnchor, typeReplace);
  console.log('page.tsx: raceResults row type extended.');
}

// (b) Add a Grid <Field> after the Position <Field>. Anchor on the entire
// Position field block.
const positionField =
  '        <Field\n' +
  '          label=\"Position\"\n' +
  '          name=\"finishPosition\"\n' +
  '          type=\"number\"\n' +
  '          defaultValue={String(result?.finishPosition ?? \"\")}\n' +
  '          min={0}\n' +
  '          max={999}\n' +
  '        />';
const positionPlusGrid =
  positionField + '\n' +
  '        <Field\n' +
  '          label=\"Grid\"\n' +
  '          name=\"startPosition\"\n' +
  '          type=\"number\"\n' +
  '          defaultValue={result?.startPosition != null ? String(result.startPosition) : \"\"}\n' +
  '          min={0}\n' +
  '          max={999}\n' +
  '        />';

if (s.includes('label=\"Grid\"')) {
  console.log('page.tsx: Grid field already present.');
} else {
  if (!s.includes(positionField)) {
    console.error('Could not find Position <Field> anchor in page.tsx');
    process.exit(1);
  }
  s = s.replace(positionField, positionPlusGrid);
  console.log('page.tsx: Grid <Field> inserted after Position.');
}

// (c) Add a Quali <Field> after the Best lap <Field>.
const bestField =
  '        <Field\n' +
  '          label=\"Best lap\"\n' +
  '          name=\"bestLapTime\"\n' +
  '          type=\"text\"\n' +
  '          defaultValue={formatMsToTime(result?.bestLapTimeMs)}\n' +
  '          placeholder=\"1:53.456\"\n' +
  '        />';
const bestPlusQuali =
  bestField + '\n' +
  '        <Field\n' +
  '          label=\"Quali\"\n' +
  '          name=\"qualifyingTime\"\n' +
  '          type=\"text\"\n' +
  '          defaultValue={formatMsToTime(result?.qualifyingTimeMs)}\n' +
  '          placeholder=\"1:53.456\"\n' +
  '        />';

if (s.includes('label=\"Quali\"')) {
  console.log('page.tsx: Quali field already present.');
} else {
  if (!s.includes(bestField)) {
    console.error('Could not find Best lap <Field> anchor in page.tsx');
    process.exit(1);
  }
  s = s.replace(bestField, bestPlusQuali);
  console.log('page.tsx: Quali <Field> inserted after Best lap.');
}

fs.writeFileSync('$PAGE', s);
"

# ---------------------------------------------------------------
# 3. Sanity check
# ---------------------------------------------------------------
echo ""
echo "=== Sanity check ==="
echo "race-results.ts references new fields:"
grep -n 'startPosition\|qualifyingTimeMs\|qualifyingTime' "$ACTION" || echo "  MISSING"
echo ""
echo "page.tsx references new fields:"
grep -n 'startPosition\|qualifyingTimeMs\|label=\"Grid\"\|label=\"Quali\"' "$PAGE" | head -20

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin round UI: Grid + Quali columns, persist via upsertRaceResult"
git push

echo ""
echo "Done. Wait ~60s for Vercel to redeploy, then reload the admin round page."
echo "You should see two new columns in each driver's row form: 'Grid' and 'Quali'."
echo "They'll be populated from the iRLM pull, and Save row persists manual edits."
