#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'

cat > /tmp/lm_penalty_target_team.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Label "Accused driver" → conditional on teamMode
s = s.replace(
  /<span className="mb-1 block text-sm text-zinc-300">\s*\n\s*Accused driver\s*\n\s*<\/span>/,
  `<span className="mb-1 block text-sm text-zinc-300">
                  {teamMode ? "Accused team" : "Accused driver"}
                </span>`
);

// (b) Dropdown — replace the team-mode optgroup version with one option per team.
//     Each option's value is the FIRST team member's registrationId (which is
//     stored on the resulting Penalty row to represent the team).
s = s.replace(
  /\{teamMode\s*\n\s*\? Array\.from\(\s*\n\s*accusedDrivers\.reduce\(\(map, d\) => \{\s*\n\s*const key = d\.registration\.team\?\.name \?\? "\(No team\)";\s*\n\s*const arr = map\.get\(key\) \?\? \[\];\s*\n\s*arr\.push\(d\);\s*\n\s*map\.set\(key, arr\);\s*\n\s*return map;\s*\n\s*\}, new Map<string, typeof accusedDrivers>\(\)\)\s*\n\s*\)\.map\(\(\[teamName, members\]\) => \(\s*\n\s*<optgroup key=\{teamName\} label=\{teamName\}>\s*\n\s*\{members\.map\(\(d\) => \(\s*\n\s*<option key=\{d\.id\} value=\{d\.registrationId\}>\s*\n\s*\{d\.registration\.user\.firstName\}\{" "\}\s*\n\s*\{d\.registration\.user\.lastName\}\s*\n\s*<\/option>\s*\n\s*\)\)\}\s*\n\s*<\/optgroup>\s*\n\s*\)\)/,
  `{teamMode
                    ? Array.from(
                        accusedDrivers.reduce((map, d) => {
                          const key = d.registration.team?.name ?? "(No team)";
                          const arr = map.get(key) ?? [];
                          arr.push(d);
                          map.set(key, arr);
                          return map;
                        }, new Map<string, typeof accusedDrivers>())
                      ).map(([teamName, members]) => (
                        <option
                          key={teamName}
                          value={members[0].registrationId}
                        >
                          {teamName}
                        </option>
                      ))`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_penalty_target_team.js "$FILE"

echo ""
echo "-- Verify --"
grep -n 'Accused driver\|Accused team\|teamName, members\|optgroup' "$FILE" | head -10

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
git commit -m "Steward report: 'Accused team' label + one option per team in penalty target dropdown (team mode); value = first team member's registrationId so existing Penalty schema still works"
git push

echo ""
echo "Done."
