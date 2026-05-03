#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Inspect: does Registration already have proAmClass?
# ============================================================================
echo "=== 1. Inspect schema ==="
echo "-- ProAmClass enum --"
grep -n 'enum ProAmClass' prisma/schema.prisma || echo "  (not present)"
echo "-- proAmClass field on Registration --"
grep -n 'proAmClass' prisma/schema.prisma | head -5 || echo "  (not present)"

# ============================================================================
# 2. Add enum + field if missing
# ============================================================================
echo ""
echo "=== 2. Ensure schema fields exist ==="
cat > /tmp/lm_schema_proam.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Enum
if (!/^enum ProAmClass/m.test(s)) {
  s = s.trimEnd() + `

enum ProAmClass {
  PRO
  AM
}
`;
  console.log('  Added ProAmClass enum.');
}

// (b) Field on Registration model
{
  const re = /(model Registration \{[\s\S]*?)(\n\})/;
  const m = s.match(re);
  if (!m) { console.error('  Registration model not found.'); process.exit(1); }
  if (!/\n\s+proAmClass\s+ProAmClass\?/.test(m[1])) {
    s = s.replace(re, m[1] + '\n  proAmClass   ProAmClass?' + m[2]);
    console.log('  Added Registration.proAmClass field.');
  } else {
    console.log('  Registration.proAmClass already present.');
  }
}

if (s !== before) fs.writeFileSync(FILE, s);
JS
node /tmp/lm_schema_proam.js

echo ""
echo "=== 3. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 4. Server action: setRegistrationProAmClass
# ============================================================================
echo ""
echo "=== 4. Append setRegistrationProAmClass action ==="
cat > /tmp/lm_proam_action.txt <<'BLOCK'

const PROAM_VALUES = new Set(["PRO", "AM", "AUTO"]);

export async function setRegistrationProAmClass(formData: FormData) {
  await requireAdmin();
  const registrationId = String(formData.get("registrationId") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!registrationId) throw new Error("registrationId required");
  if (!PROAM_VALUES.has(value)) throw new Error("Invalid value");

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: { proAmClass: value === "AUTO" ? null : (value as "PRO" | "AM") },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/pro-am`
  );
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/admin-registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('setRegistrationProAmClass')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_proam_action.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended.');
"

# ============================================================================
# 5. Client component: ProAmOverrideSelect (auto-save)
# ============================================================================
echo ""
echo "=== 5. Create ProAmOverrideSelect component ==="
cat > src/components/ProAmOverrideSelect.tsx <<'TSX'
"use client";

import { setRegistrationProAmClass } from "@/lib/actions/admin-registrations";

const COLOR: Record<string, string> = {
  PRO: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  AM: "border-zinc-700/50 bg-zinc-900 text-zinc-300",
  AUTO: "border-zinc-700/50 bg-zinc-900 text-zinc-500 italic",
};

export default function ProAmOverrideSelect({
  registrationId,
  value,
  suggested,
}: {
  registrationId: string;
  // current stored value: "PRO" | "AM" | null. Null is "Auto".
  value: "PRO" | "AM" | null;
  // for admin reference; not submitted
  suggested: "PRO" | "AM" | "UNRANKED";
}) {
  const current = value ?? "AUTO";
  const cls = COLOR[current] ?? COLOR.AUTO;
  return (
    <form action={setRegistrationProAmClass} className="inline-block">
      <input type="hidden" name="registrationId" value={registrationId} />
      <select
        name="value"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        title={`Algorithm suggests: ${suggested}`}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="AUTO">Auto</option>
        <option value="PRO">Pro</option>
        <option value="AM">Am</option>
      </select>
    </form>
  );
}
TSX
echo "  Written."

# ============================================================================
# 6. Update calculator page: add Override column + fetch proAmClass
# ============================================================================
echo ""
echo "=== 6. Update calculator page ==="
cat > /tmp/lm_calc_patch.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/pro-am/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add import for ProAmOverrideSelect
if (!s.includes('ProAmOverrideSelect')) {
  s = s.replace(
    /import \{ requireAdmin \} from "@\/lib\/auth-helpers";/,
    `import { requireAdmin } from "@/lib/auth-helpers";
import ProAmOverrideSelect from "@/components/ProAmOverrideSelect";`
  );
}

// (b) Add proAmClass to the Row type
s = s.replace(
  /(starts: number;\s*\n\s*rawAvg: number;)/,
  `proAmClass: "PRO" | "AM" | null;
    $1`
);

// (c) Capture proAmClass when building the row
s = s.replace(
  /(return \{\s*\n\s*regId: reg\.id,)/,
  `return {
      proAmClass: (reg as { proAmClass: "PRO" | "AM" | null }).proAmClass ?? null,
      regId: reg.id,`
);

// (d) Add new column header in the eligible table
s = s.replace(
  /<th className="px-3 py-2">Suggested<\/th>/,
  `<th className="px-3 py-2">Suggested</th>
                  <th className="px-3 py-2">Override</th>`
);

// (e) Add new override cell after the Suggested cell (which is the last <td> in eligible rows)
// Eligible table rows end with the Pro/Am suggestion badge + </td></tr>. Insert override <td> before the closing </tr>.
s = s.replace(
  /(<span\s*\n\s*className=\{`inline-block rounded border px-2 py-0\.5 text-xs \$\{\s*\n\s*isPro\s*\n\s*\? "border-emerald-700\/50 bg-emerald-950\/40 text-emerald-200"\s*\n\s*: "border-zinc-700\/50 bg-zinc-900 text-zinc-300"\s*\n\s*\}`\}\s*\n\s*>\s*\n\s*\{isPro \? "Pro" : "Am"\}\s*\n\s*<\/span>\s*\n\s*<\/td>)(\s*\n\s*\);)/,
  `$1
                      <td className="px-3 py-2">
                        <ProAmOverrideSelect
                          registrationId={r.regId}
                          value={r.proAmClass}
                          suggested={isPro ? "PRO" : "AM"}
                        />
                      </td>$2`
);

// (f) Same for the Unranked table — add Override column header + cell.
//     The Unranked table currently has 5 columns; we add a 6th.
s = s.replace(
  /(<thead className="bg-zinc-900 text-left text-zinc-400">\s*\n\s*<tr>\s*\n\s*<th className="px-3 py-2">Driver<\/th>\s*\n\s*<th className="px-3 py-2">iRacing ID<\/th>\s*\n\s*<th className="px-3 py-2">Starts<\/th>\s*\n\s*<th className="px-3 py-2">Raw avg<\/th>\s*\n\s*<th className="px-3 py-2">Avg inc\.<\/th>)/,
  `$1
                  <th className="px-3 py-2">Override</th>`
);

// Insert override cell at end of unranked rows
s = s.replace(
  /(<tr\s*\n\s*key=\{r\.regId\}\s*\n\s*className="border-t border-zinc-800 hover:bg-zinc-900"\s*\n\s*>\s*\n\s*<td className="px-3 py-2 font-medium">\s*\n\s*\{r\.firstName\} \{r\.lastName\}\s*\n\s*<\/td>\s*\n\s*<td className="px-3 py-2 text-zinc-400">\s*\n\s*\{r\.iracingMemberId \?\? "—"\}\s*\n\s*<\/td>\s*\n\s*<td className="px-3 py-2 text-zinc-400">\{r\.starts\}<\/td>\s*\n\s*<td className="px-3 py-2 text-zinc-400">\s*\n\s*\{r\.rawAvg\.toFixed\(2\)\}\s*\n\s*<\/td>\s*\n\s*<td className="px-3 py-2 text-zinc-400">\s*\n\s*\{r\.avgIncidents\.toFixed\(1\)\}\s*\n\s*<\/td>)(\s*\n\s*<\/tr>)/,
  `$1
                    <td className="px-3 py-2">
                      <ProAmOverrideSelect
                        registrationId={r.regId}
                        value={r.proAmClass}
                        suggested="UNRANKED"
                      />
                    </td>$2`
);

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_calc_patch.js

echo ""
echo "-- Verify --"
grep -n 'ProAmOverrideSelect\|proAmClass' src/app/admin/leagues/\[slug\]/seasons/\[seasonId\]/pro-am/page.tsx | head -10

# ============================================================================
# 7. TS check
# ============================================================================
echo ""
echo "=== 7. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 8. Commit + push
# ============================================================================
echo ""
echo "=== 8. Commit + push ==="
git add -A
git status --short
git commit -m "Pro/Am: per-row override (Auto/Pro/Am) on the calculator, auto-saves to Registration.proAmClass"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on the calculator page each row has an Override dropdown:"
echo "  • Auto  = follow the algorithm's suggestion (proAmClass = null in DB)"
echo "  • Pro   = force PRO regardless of suggestion"
echo "  • Am    = force AM regardless of suggestion"
echo "Auto-saves on change. Hover the dropdown to see the algorithm's"
echo "suggestion in the tooltip."
