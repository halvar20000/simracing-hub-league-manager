#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: flip @default(PENDING) -> @default(NO) for the 3 admin flags
# ============================================================================
echo "=== 1. Schema defaults ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(/(\bstartingFeePaid\s+AdminCheckStatus\s+@default\()PENDING\)/, '\$1NO)');
s = s.replace(/(\biracingInvitationSent\s+AdminCheckStatus\s+@default\()PENDING\)/, '\$1NO)');
s = s.replace(/(\biracingInvitationAccepted\s+AdminCheckStatus\s+@default\()PENDING\)/, '\$1NO)');
if (s === before) {
  console.log('  Defaults already updated (or fields not found).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Defaults set to NO.');
}
"

echo "-- Verify --"
grep -n 'startingFeePaid\|iracingInvitationSent\|iracingInvitationAccepted' prisma/schema.prisma

# ============================================================================
# 2. Push + regenerate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Migrate existing PENDING values to NO
# ============================================================================
echo ""
echo "=== 3. Migrate existing PENDING -> NO ==="
cat > ./_migrate_flags.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const a = await p.registration.updateMany({
    where: { startingFeePaid: 'PENDING' },
    data: { startingFeePaid: 'NO' },
  });
  const b = await p.registration.updateMany({
    where: { iracingInvitationSent: 'PENDING' },
    data: { iracingInvitationSent: 'NO' },
  });
  const c = await p.registration.updateMany({
    where: { iracingInvitationAccepted: 'PENDING' },
    data: { iracingInvitationAccepted: 'NO' },
  });
  console.log('  startingFeePaid:           ' + a.count + ' rows migrated');
  console.log('  iracingInvitationSent:     ' + b.count + ' rows migrated');
  console.log('  iracingInvitationAccepted: ' + c.count + ' rows migrated');
  await p.$disconnect();
})();
JS
node ./_migrate_flags.cjs
rm ./_migrate_flags.cjs

# ============================================================================
# 4. RegistrationFlagSelect: only YES/NO, per-field labels
# ============================================================================
echo ""
echo "=== 4. RegistrationFlagSelect: per-field labels, two-state ==="
cat > src/components/RegistrationFlagSelect.tsx <<'TSX'
"use client";

import { updateRegistrationFlag } from "@/lib/actions/admin-registrations";

type Field =
  | "startingFeePaid"
  | "iracingInvitationSent"
  | "iracingInvitationAccepted";

const LABELS: Record<Field, { YES: string; NO: string }> = {
  startingFeePaid: { YES: "Paid", NO: "Not paid" },
  iracingInvitationSent: { YES: "Sent", NO: "Not sent" },
  iracingInvitationAccepted: { YES: "Accepted", NO: "Not accepted" },
};

const COLOR: Record<string, string> = {
  YES: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  NO: "border-red-800/50 bg-red-950/40 text-red-200",
};

export default function RegistrationFlagSelect({
  registrationId,
  field,
  value,
}: {
  registrationId: string;
  field: Field;
  // PENDING is still a valid enum but no longer offered in the UI; if a row
  // somehow still has it, render as NO so the select isn't blank.
  value: "PENDING" | "YES" | "NO";
}) {
  const safeValue = value === "PENDING" ? "NO" : value;
  const labels = LABELS[field];
  const cls = COLOR[safeValue] ?? COLOR.NO;
  return (
    <form action={updateRegistrationFlag}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={safeValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="NO">{labels.NO}</option>
        <option value="YES">{labels.YES}</option>
      </select>
    </form>
  );
}
TSX
echo "  Written."

# ============================================================================
# 5. Roster page: add 'iRacing' subhead above Invite + Accepted columns
# ============================================================================
echo ""
echo "=== 5. Roster: add iRacing subhead ==="
ROSTER='src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'
node -e "
const fs = require('fs');
let s = fs.readFileSync('$ROSTER', 'utf8');
const before = s;

// Replace plain Invite header
s = s.replace(
  /<th className=\"px-4 py-3\">Invite<\/th>/,
  \`<th className=\"px-4 py-3\">
                <div className=\"text-[10px] uppercase tracking-wide text-zinc-500\">iRacing</div>
                Invite
              </th>\`
);

// Replace plain Accepted header
s = s.replace(
  /<th className=\"px-4 py-3\">Accepted<\/th>/,
  \`<th className=\"px-4 py-3\">
                <div className=\"text-[10px] uppercase tracking-wide text-zinc-500\">iRacing</div>
                Accepted
              </th>\`
);

if (s === before) {
  console.error('  Anchors not found — header may have already been edited.');
  process.exit(1);
}
fs.writeFileSync('$ROSTER', s);
console.log('  Patched.');
"

echo "-- Verify --"
grep -n 'iRacing\|Invite\|Accepted' "$ROSTER" | head -10

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
git commit -m "Roster: two-state flags with per-field labels (Paid/Sent/Accepted) + iRacing subhead"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "What changed on the admin roster:"
echo "  • Fee dropdown:      Not paid / Paid (defaults to Not paid)"
echo "  • Invite dropdown:   Not sent / Sent (defaults to Not sent)"
echo "  • Accepted dropdown: Not accepted / Accepted (defaults to Not accepted)"
echo "  • Existing PENDING values were migrated to NO."
echo "  • Above 'Invite' and 'Accepted' column headers, a small grey 'iRacing'"
echo "    label clarifies what those columns are for."
