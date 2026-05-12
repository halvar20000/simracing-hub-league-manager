#!/usr/bin/env bash
# Fix: declare the iRLM variables in updateSeason / updateRound so they're in scope.
# The previous patch added the data fields but not the variable declarations.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# seasons.ts — add irlmLeagueName + irlmSeasonId variable declarations
# ------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'src/lib/actions/seasons.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('const irlmLeagueName =')) {
  // Insert just before the call to prisma.season.update inside updateSeason
  s = s.replace(
    /(export async function updateSeason\([\s\S]*?)(await prisma\.season\.update\(\{)/,
    (m, head, callStart) =>
      head +
      \`const irlmLeagueName = String(formData.get(\"irlmLeagueName\") ?? \"\").trim() || null;
  const irlmSeasonIdRaw = String(formData.get(\"irlmSeasonId\") ?? \"\").trim();
  const irlmSeasonId = irlmSeasonIdRaw ? parseInt(irlmSeasonIdRaw, 10) : null;

  \` + callStart
  );
  fs.writeFileSync(path, s);
  console.log('Patched seasons.ts');
} else {
  console.log('seasons.ts already declares iRLM vars');
}
"

# ------------------------------------------------------------
# rounds.ts — add irlmEventId variable declaration
# ------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'src/lib/actions/rounds.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('const irlmEventId')) {
  s = s.replace(
    /(export async function updateRound\([\s\S]*?)(await prisma\.round\.update\(\{)/,
    (m, head, callStart) =>
      head +
      \`const irlmEventIdRaw = String(formData.get(\"irlmEventId\") ?? \"\").trim();
  const irlmEventId = irlmEventIdRaw ? parseInt(irlmEventIdRaw, 10) : null;

  \` + callStart
  );
  fs.writeFileSync(path, s);
  console.log('Patched rounds.ts');
} else {
  console.log('rounds.ts already declares iRLM var');
}
"

# Quick sanity check
echo ""
echo "Checking variables are declared..."
grep -n 'const irlmLeagueName' src/lib/actions/seasons.ts || echo "  MISSING in seasons.ts"
grep -n 'const irlmEventId' src/lib/actions/rounds.ts || echo "  MISSING in rounds.ts"

echo ""
echo "Done. Push again:"
echo "  git add -A && git commit -m 'Fix iRLM var declarations' && git push"
