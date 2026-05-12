#!/usr/bin/env bash
# Fix the FPR awards section: it's a TEAM award, not a driver award.
# Schema: FPRAward { team, carClass, teamIncidentTotal, fprPointsAwarded }
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

node -e "
const fs = require('fs');
let s = fs.readFileSync('$PAGE', 'utf8');

// 1) Strip the bogus 'user: true' from the include.
s = s.replace(
  /fprAwards: \{\\s*include: \{ team: true, carClass: true, user: true \},\\s*\},/,
  'fprAwards: { include: { team: true, carClass: true } },'
);

// 2) Replace the entire FPR <section> with the correct, schema-matching one.
const startMarker = '{round.fprAwards.length > 0 && (';
const startIdx = s.indexOf(startMarker);
if (startIdx < 0) {
  console.error('Could not find FPR section start.');
  process.exit(1);
}
// Find the matching closing for the FPR section.
const endMarker = ')}';
// Search for first ')}\\n' AFTER the starting marker that closes the section.
// We rely on this section being the last conditional before the outer </div>.
let endIdx = s.indexOf('      )}\\n    </div>', startIdx);
if (endIdx < 0) {
  console.error('Could not find FPR section end (')}\\\\n    </div>').');
  process.exit(1);
}
endIdx += 8; // past '      )}\\n'

const replacement = \`{round.fprAwards.length > 0 && (
        <section>
          <h2 className=\"mb-3 text-lg font-semibold\">FPR awards</h2>
          <div className=\"overflow-hidden rounded border border-zinc-800\">
            <table className=\"w-full text-sm\">
              <thead className=\"bg-zinc-900 text-left text-zinc-400\">
                <tr>
                  <th className=\"px-3 py-2\">Team</th>
                  {isMulticlass && <th className=\"px-3 py-2\">Class</th>}
                  <th className=\"px-3 py-2 text-right\">Team incidents</th>
                  <th className=\"px-3 py-2 text-right\">FPR pts</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className=\"border-t border-zinc-800\">
                    <td className=\"px-3 py-2 font-medium\">{a.team.name}</td>
                    {isMulticlass && (
                      <td className=\"px-3 py-2 text-zinc-400\">
                        {a.carClass?.name ?? \"—\"}
                      </td>
                    )}
                    <td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\">
                      {a.teamIncidentTotal}
                    </td>
                    <td className=\"px-3 py-2 text-right font-semibold text-orange-400 tabular-nums\">
                      {a.fprPointsAwarded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}\`;

s = s.slice(0, startIdx) + replacement + s.slice(endIdx);
fs.writeFileSync('$PAGE', s);
console.log('FPR section rewritten with correct schema fields.');
"

echo ""
echo "Confirm the include is correct and no a.user / a.fprPoints / a.registration left:"
grep -n 'fprAwards: {\\|a\\.user\\|a\\.fprPoints\\|a\\.registration' "$PAGE" || echo "  (clean)"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Fix FPR section: team award, correct include + fields"
git push

echo ""
echo "Done. Wait ~60s for the Vercel build to go green."
