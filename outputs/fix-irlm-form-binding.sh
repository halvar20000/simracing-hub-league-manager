#!/usr/bin/env bash
# Fix the iRLM Pull button by switching from .bind() to FormData with hidden inputs.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Change pullResultsFromIRLM signature to accept FormData
# ------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'src/lib/actions/irlm-import.ts';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(
  /export async function pullResultsFromIRLM\(\s*leagueSlug: string,\s*seasonId: string,\s*roundId: string\s*\)/,
  \`export async function pullResultsFromIRLM(formData: FormData)\`
);

// At the start of the function body, extract args from FormData
s = s.replace(
  /export async function pullResultsFromIRLM\(formData: FormData\) \{\s*const admin = await requireAdmin\(\);/,
  \`export async function pullResultsFromIRLM(formData: FormData) {
  const leagueSlug = String(formData.get(\"leagueSlug\") ?? \"\");
  const seasonId = String(formData.get(\"seasonId\") ?? \"\");
  const roundId = String(formData.get(\"roundId\") ?? \"\");
  if (!leagueSlug || !seasonId || !roundId) return;

  const admin = await requireAdmin();\`
);

fs.writeFileSync(path, s);
console.log('Patched action signature.');
"

# ------------------------------------------------------------
# 2. Update the form on the admin round page
# ------------------------------------------------------------
node -e "
const fs = require('fs');
const path = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(
  /<form action=\{pullResultsFromIRLM\.bind\(null, slug, seasonId, roundId\)\}>\s*<button[\s\S]*?Pull from iRLM\s*<\/button>\s*<\/form>/,
  \`<form action={pullResultsFromIRLM}>
                <input type=\"hidden\" name=\"leagueSlug\" value={slug} />
                <input type=\"hidden\" name=\"seasonId\" value={seasonId} />
                <input type=\"hidden\" name=\"roundId\" value={roundId} />
                <button
                  type=\"submit\"
                  className=\"rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900\"
                >
                  Pull from iRLM
                </button>
              </form>\`
);

fs.writeFileSync(path, s);
console.log('Patched form to use hidden inputs.');
"

echo ""
echo "Done. Push:"
echo "  git add -A && git commit -m 'Switch iRLM pull to FormData' && git push"
