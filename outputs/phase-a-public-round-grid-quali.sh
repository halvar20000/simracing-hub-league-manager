#!/usr/bin/env bash
# Phase A: add Grid + Quali columns to the public round results table.
# Placement:
#   - "Grid" right after "Pos" (overall vs grid is the natural racing pairing)
#   - "Quali" right after "Time" (qualifying lap then race-best lap)
#
# Idempotent — safe to re-run.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

node -e "
const fs = require('fs');
let s = fs.readFileSync('$PAGE', 'utf8');

// (1) thead: insert <th>Grid</th> right after <th>Pos</th>
const headPosAnchor = '<th className=\"px-3 py-2\">Pos</th>';
const headPosWithGrid =
  '<th className=\"px-3 py-2\">Pos</th>\n                  ' +
  '<th className=\"px-3 py-2\">Grid</th>';
if (s.includes('<th className=\"px-3 py-2\">Grid</th>')) {
  console.log('thead: Grid column already present.');
} else {
  if (!s.includes(headPosAnchor)) {
    console.error('Could not find Pos <th> anchor.');
    process.exit(1);
  }
  s = s.replace(headPosAnchor, headPosWithGrid);
  console.log('thead: Grid column inserted after Pos.');
}

// (2) thead: insert <th>Quali</th> right after <th>Time</th>
const headTimeAnchor = '<th className=\"px-3 py-2 text-right\">Time</th>';
const headTimeWithQuali =
  '<th className=\"px-3 py-2 text-right\">Time</th>\n                  ' +
  '<th className=\"px-3 py-2 text-right\">Quali</th>';
if (s.includes('<th className=\"px-3 py-2 text-right\">Quali</th>')) {
  console.log('thead: Quali column already present.');
} else {
  if (!s.includes(headTimeAnchor)) {
    console.error('Could not find Time <th> anchor.');
    process.exit(1);
  }
  s = s.replace(headTimeAnchor, headTimeWithQuali);
  console.log('thead: Quali column inserted after Time.');
}

// (3) tbody: insert grid <td> right after the finishPosition <td>
const bodyPosAnchor =
  '<td className=\"px-3 py-2 font-medium\">\n                        {r.finishStatus === \"CLASSIFIED\"\n                          ? r.finishPosition\n                          : r.finishStatus}\n                      </td>';
const bodyPosWithGrid = bodyPosAnchor +
  '\n                      <td className=\"px-3 py-2 text-zinc-500\">\n' +
  '                        {r.startPosition ?? \"—\"}\n' +
  '                      </td>';
if (s.includes('{r.startPosition ?? \"—\"}')) {
  console.log('tbody: Grid cell already present.');
} else {
  if (!s.includes(bodyPosAnchor)) {
    console.error('Could not find finishPosition <td> anchor in tbody.');
    process.exit(1);
  }
  s = s.replace(bodyPosAnchor, bodyPosWithGrid);
  console.log('tbody: Grid cell inserted.');
}

// (4) tbody: insert quali <td> right after the total-time <td>
//     The total-time <td> ends with the closing </td>. The cleanest anchor is
//     the entire conditional rendering for time:
const bodyTimeAnchor =
  '<td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\">\n                        {r.finishStatus === \"CLASSIFIED\" && r.totalTimeMs\n                          ? formatMsToTime(r.totalTimeMs)\n                          : r.finishStatus === \"CLASSIFIED\" && gap != null\n                            ? \`+\${formatMsToTime(gap)}\`\n                            : \"—\"}\n                      </td>';
const bodyTimeWithQuali = bodyTimeAnchor +
  '\n                      <td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\">\n' +
  '                        {formatMsToTime(r.qualifyingTimeMs) || \"—\"}\n' +
  '                      </td>';
if (s.includes('{formatMsToTime(r.qualifyingTimeMs) || \"—\"}')) {
  console.log('tbody: Quali cell already present.');
} else {
  if (!s.includes(bodyTimeAnchor)) {
    console.error('Could not find total-time <td> anchor in tbody.');
    process.exit(1);
  }
  s = s.replace(bodyTimeAnchor, bodyTimeWithQuali);
  console.log('tbody: Quali cell inserted.');
}

fs.writeFileSync('$PAGE', s);
"

echo ""
echo "=== Sanity check ==="
echo "Header columns now (look for Grid and Quali):"
grep -n '<th className=\"px-3 py-2' "$PAGE" | head -20

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: add Grid + Quali columns"
git push

echo ""
echo "Done. Wait ~60s for Vercel, then reload the public round page."
