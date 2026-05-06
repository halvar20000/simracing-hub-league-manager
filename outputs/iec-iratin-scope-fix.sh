#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Fix scope: restore startNumber in solo, move iRating constants into team ==="
cat > /tmp/lm_iratin_scope_fix.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Restore startNumber parsing in solo. The iRating constants currently
//     sit where the solo's startNumber parsing used to live. Swap them back.
s = s.replace(
  /const LMP2_MIN_IRATING = 1500;\s*\n\s*const MAX_IRATING = 5000;\s*\n\s*const leaderIRatingRaw = String\(formData\.get\("leaderIRating"\) \?\? ""\)\.trim\(\);\s*\n/,
  `const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
`
);

// (b) Move iRating constants into team. Anchor on the team's startNumber
//     block uniquely identified by the `const notes` + `const errBack`
//     sequence that follows (only the team function has errBack).
s = s.replace(
  /const startNumberRaw = String\(formData\.get\("startNumber"\) \?\? ""\)\.trim\(\);\s*\n\s*const startNumber = startNumberRaw \? parseInt\(startNumberRaw, 10\) : null;\s*\n(\s*const notes = String\(formData\.get\("notes"\) \?\? ""\)\.trim\(\) \|\| null;\s*\n\s*\n\s*const errBack)/,
  `const LMP2_MIN_IRATING = 1500;
  const MAX_IRATING = 5000;
  const leaderIRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
$1`
);

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_iratin_scope_fix.js

echo ""
echo "-- Verify --"
echo "-- solo (createRegistration) startNumber should be back --"
grep -n 'startNumberRaw' src/lib/actions/registrations.ts
echo ""
echo "-- team (createTeamRegistration) constants now in scope --"
grep -n 'LMP2_MIN_IRATING\|MAX_IRATING\|leaderIRatingRaw' src/lib/actions/registrations.ts | head -10

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Registrations actions: restore startNumber parsing in solo, scope iRating constants to team only"
git push

echo ""
echo "Done."
