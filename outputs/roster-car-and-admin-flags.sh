#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

ROSTER='src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'

# ============================================================================
# 1. SCHEMA: add AdminCheckStatus enum + 3 fields on Registration
# ============================================================================
echo "=== 1. Schema ==="
cat > /tmp/lm_schema_flags.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add enum if missing
if (!/enum AdminCheckStatus/.test(s)) {
  s = s.trimEnd() + `

enum AdminCheckStatus {
  PENDING
  YES
  NO
}
`;
  console.log('  Added AdminCheckStatus enum.');
}

// (b) Add 3 fields to Registration model
const re = /(model Registration \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  Registration model not found.'); process.exit(1); }
let body = m[1];
let mod = false;
if (!/startingFeePaid\s/.test(body)) {
  body += '\n  startingFeePaid           AdminCheckStatus @default(PENDING)';
  mod = true;
}
if (!/iracingInvitationSent\s/.test(body)) {
  body += '\n  iracingInvitationSent     AdminCheckStatus @default(PENDING)';
  mod = true;
}
if (!/iracingInvitationAccepted\s/.test(body)) {
  body += '\n  iracingInvitationAccepted AdminCheckStatus @default(PENDING)';
  mod = true;
}
if (mod) {
  s = s.replace(re, body + m[2]);
  console.log('  Added 3 admin-check fields to Registration.');
} else {
  console.log('  Fields already present.');
}

if (s !== before) fs.writeFileSync(FILE, s);
JS
node /tmp/lm_schema_flags.js

echo ""
echo "-- Verify --"
grep -n 'enum AdminCheckStatus\|startingFeePaid\|iracingInvitationSent\|iracingInvitationAccepted' prisma/schema.prisma | head -10

# ============================================================================
# 2. Push + regenerate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. RegistrationFlagSelect client component
# ============================================================================
echo ""
echo "=== 3. RegistrationFlagSelect component ==="
mkdir -p src/components
cat > src/components/RegistrationFlagSelect.tsx <<'TSX'
"use client";

import { updateRegistrationFlag } from "@/lib/actions/admin-registrations";

const COLOR: Record<string, string> = {
  PENDING: "border-amber-700/50 bg-amber-950/40 text-amber-200",
  YES: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  NO: "border-red-800/50 bg-red-950/40 text-red-200",
};

export default function RegistrationFlagSelect({
  registrationId,
  field,
  value,
}: {
  registrationId: string;
  field: "startingFeePaid" | "iracingInvitationSent" | "iracingInvitationAccepted";
  value: "PENDING" | "YES" | "NO";
}) {
  const cls = COLOR[value] ?? COLOR.PENDING;
  return (
    <form action={updateRegistrationFlag}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="PENDING">Pending</option>
        <option value="YES">Yes</option>
        <option value="NO">No</option>
      </select>
    </form>
  );
}
TSX
echo "  Written."

# ============================================================================
# 4. Append updateRegistrationFlag to src/lib/actions/admin-registrations.ts
# ============================================================================
echo ""
echo "=== 4. updateRegistrationFlag action ==="
cat > /tmp/lm_flag_action.txt <<'BLOCK'

const ADMIN_CHECK_FIELDS = new Set([
  "startingFeePaid",
  "iracingInvitationSent",
  "iracingInvitationAccepted",
]);

const ADMIN_CHECK_VALUES = new Set(["PENDING", "YES", "NO"]);

export async function updateRegistrationFlag(formData: FormData) {
  await requireAdmin();
  const registrationId = String(formData.get("registrationId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");

  if (!registrationId) throw new Error("registrationId required");
  if (!ADMIN_CHECK_FIELDS.has(field)) throw new Error("Invalid field");
  if (!ADMIN_CHECK_VALUES.has(value)) throw new Error("Invalid value");

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    // The field name is whitelisted above; cast is necessary because the key
    // is a runtime string here.
    data: { [field]: value } as never,
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/admin-registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('updateRegistrationFlag')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_flag_action.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended.');
"

# ============================================================================
# 5. Roster page: include car, add columns, update colspan
# ============================================================================
echo ""
echo "=== 5. Patch roster page ==="
cat > /tmp/lm_roster_patch.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add import for RegistrationFlagSelect
if (!s.includes('RegistrationFlagSelect')) {
  s = s.replace(
    /import \{\s*\n\s*approveRegistration,\s*\n\s*rejectRegistration,\s*\n\} from "@\/lib\/actions\/admin-registrations";/,
    `import {
  approveRegistration,
  rejectRegistration,
} from "@/lib/actions/admin-registrations";
import RegistrationFlagSelect from "@/components/RegistrationFlagSelect";`
  );
}

// (b) include car: true on the registrations query
s = s.replace(
  /(include: \{\s*\n\s*user: true,\s*\n\s*team: true,\s*\n\s*carClass: true,\s*\n\s*\},)/,
  `include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },`
);

// (c) Insert Car header right after Class header
if (!/<th[^>]*>Car<\/th>/.test(s)) {
  s = s.replace(
    /<th className="px-4 py-3">Class<\/th>/,
    `<th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Car</th>`
  );
}

// (d) Insert Fee / Invite / Accepted headers after Status header, before Actions
if (!/<th[^>]*>Fee<\/th>/.test(s)) {
  s = s.replace(
    /<th className="px-4 py-3">Status<\/th>/,
    `<th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Invite</th>
              <th className="px-4 py-3">Accepted</th>`
  );
}

// (e) Insert Car cell right after Class cell
//     Class cell looks like:  <td className="px-4 py-3 text-zinc-400">\n  {r.carClass?.name ?? "—"}\n</td>
if (!/r\.car\?\.name/.test(s)) {
  s = s.replace(
    /(<td className="px-4 py-3 text-zinc-400">\s*\n\s*\{r\.carClass\?\.name \?\? "—"\}\s*\n\s*<\/td>)/,
    `$1
                <td className="px-4 py-3 text-zinc-400">
                  {r.car?.name ?? "—"}
                </td>`
  );
}

// (f) Insert 3 flag-select cells right after the Status cell, before Actions cell.
//     The Status cell ends with </td> followed by the Actions cell which has class "px-4 py-3 text-right".
if (!/RegistrationFlagSelect/.test(s.split('return (')[1] ?? s)) {
  s = s.replace(
    /(<\/td>\s*\n\s*<td className="px-4 py-3 text-right">)/,
    `</td>
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="startingFeePaid"
                    value={r.startingFeePaid}
                  />
                </td>
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationSent"
                    value={r.iracingInvitationSent}
                  />
                </td>
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationAccepted"
                    value={r.iracingInvitationAccepted}
                  />
                </td>
                <td className="px-4 py-3 text-right">`
  );
}

// (g) Bump colSpan on the empty-state row by 4 (8 → 12, etc.)
s = s.replace(/colSpan=\{(\d+)\}/g, (_, n) => `colSpan={${parseInt(n, 10) + 4}}`);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched roster page.');
JS
node /tmp/lm_roster_patch.js "$ROSTER"

echo ""
echo "-- Verify --"
grep -n 'RegistrationFlagSelect\|<th[^>]*>Car<\|<th[^>]*>Fee<\|car: true\|colSpan=' "$ROSTER" | head -15

# ============================================================================
# 6. TS check
# ============================================================================
echo ""
echo "=== 6. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 7. Commit + push
# ============================================================================
echo ""
echo "=== 7. Commit + push ==="
git add -A
git status --short
git commit -m "Roster: add Car column + 3 admin-check dropdowns (Fee / iRacing invite / accepted)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on /admin/leagues/<slug>/seasons/<id>/roster:"
echo "  • A 'Car' column appears between Class and Pro/Am, showing the car each driver picked."
echo "  • Three new dropdowns appear between Status and Actions:"
echo "      Fee  /  Invite  /  Accepted"
echo "    Defaults to PENDING for every existing registration."
echo "  • Picking Yes/No auto-saves on change (no submit button)."
