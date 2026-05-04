#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. updateLeague action — correct anchors this time
# ============================================================================
echo "=== 1. Patch updateLeague action ==="
cat > /tmp/lm_update_league_v2.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/leagues.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('paypalUsername')) {
  console.log('  Already handles paypalUsername.');
  process.exit(0);
}

// (a) Add parsing after the registrationNotifyEmails .filter() chain
s = s.replace(
  /(const registrationNotifyEmails = emailsRaw\s*\n\s*\.split\(\/\[\\n,;\]\+\/\)\s*\n\s*\.map\(\(e\) => e\.trim\(\)\)\s*\n\s*\.filter\(\(e\) => e\.length > 0 && \/@\/\.test\(e\)\);)/,
  `$1

  const paypalUsername =
    String(formData.get("paypalUsername") ?? "").trim() || null;

  const feeRaw = String(formData.get("registrationFee") ?? "").trim();
  const registrationFee =
    feeRaw && /^\\d+$/.test(feeRaw) ? parseInt(feeRaw, 10) : null;

  const currencyRaw = String(formData.get("registrationFeeCurrency") ?? "")
    .trim()
    .toUpperCase();
  const registrationFeeCurrency = currencyRaw || "EUR";`
);

// (b) Add the three fields inside data: { ... }
s = s.replace(
  /(data: \{\s*\n\s*name,\s*\n\s*description,\s*\n\s*discordRegistrationsWebhookUrl,\s*\n\s*registrationNotifyEmails,\s*\n\s*\},)/,
  `data: {
      name,
      description,
      discordRegistrationsWebhookUrl,
      registrationNotifyEmails,
      paypalUsername,
      registrationFee,
      registrationFeeCurrency,
    },`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_update_league_v2.js

echo "-- Verify action --"
grep -n 'paypalUsername\|registrationFee\b' src/lib/actions/leagues.ts | head -10

# ============================================================================
# 2. League edit form — add the 3 fields
# ============================================================================
echo ""
echo "=== 2. Patch league edit page ==="
cat > /tmp/lm_league_edit_v2.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/edit/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('name="paypalUsername"')) {
  console.log('  Already present.');
  process.exit(0);
}
const before = s;

// Anchor on the closing </label> of the discord webhook input.
s = s.replace(
  /(name="discordRegistrationsWebhookUrl"[\s\S]*?<\/label>)/,
  `$1

        <fieldset className="rounded border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <legend className="px-2 text-sm text-zinc-300">
            Registration fee (optional)
          </legend>
          <p className="text-xs text-zinc-500">
            If set, drivers will see a PayPal payment link after registering.
            The link uses Friends &amp; Family + their real name as reference,
            shown automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Amount</span>
              <input
                name="registrationFee"
                type="number"
                min={0}
                step={1}
                defaultValue={league.registrationFee ?? ""}
                placeholder="10"
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Currency</span>
              <input
                name="registrationFeeCurrency"
                type="text"
                defaultValue={league.registrationFeeCurrency ?? "EUR"}
                placeholder="EUR"
                maxLength={3}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm uppercase text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                PayPal.me username
              </span>
              <input
                name="paypalUsername"
                type="text"
                defaultValue={league.paypalUsername ?? ""}
                placeholder="auro2082"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Generates link:{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              paypal.me/&lt;username&gt;/&lt;amount&gt;&lt;currency&gt;
            </code>
          </p>
        </fieldset>`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_league_edit_v2.js

# ============================================================================
# 3. Registration form fee banner
# ============================================================================
echo ""
echo "=== 3. Patch registration form ==="
cat > /tmp/lm_register_fee_v2.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (!s.includes('getLeaguePayment')) {
  s = s.replace(
    /import \{ createRegistration \} from "@\/lib\/actions\/registrations";/,
    `import { createRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";`
  );
}

if (!s.includes('const paymentInfo = getLeaguePayment')) {
  s = s.replace(
    /(const hasCars = carClasses\.some\(\(cc\) => cc\.cars\.length > 0\);)/,
    `$1
  const paymentInfo = getLeaguePayment(season.league);`
  );
}

if (!s.includes('variant="preview"')) {
  s = s.replace(
    /(\n\s*<div className="flex gap-2">\s*\n\s*<button)/,
    `

        {paymentInfo && (
          <PaymentNotice payment={paymentInfo} variant="preview" />
        )}$1`
  );
}

if (s === before) {
  console.log('  Already patched.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
JS
node /tmp/lm_register_fee_v2.js

# ============================================================================
# 4. /registrations page
# ============================================================================
echo ""
echo "=== 4. Patch /registrations page ==="
cat > /tmp/lm_reg_page_v2.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/registrations/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (!s.includes('getLeaguePayment')) {
  s = s.replace(
    /import \{ withdrawRegistration \} from "@\/lib\/actions\/registrations";/,
    `import { withdrawRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";`
  );
}

if (!s.includes('const me = await prisma.user.findUnique')) {
  s = s.replace(
    /(const registrations = await prisma\.registration\.findMany\(\{[\s\S]*?\}\);)/,
    `$1

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  });
  const driverName = me ? \`\${me.firstName ?? ""} \${me.lastName ?? ""}\`.trim() : "";`
  );
}

if (!s.includes('PaymentNotice')) {
  s = s.replace(
    /(<div\s*\n?\s*key=\{r\.id\}\s*\n?\s*className="rounded border border-zinc-800 bg-zinc-900 p-4"\s*\n?\s*>[\s\S]*?)(\n\s*<\/div>\s*\n\s*\)\)\}\s*\n\s*<\/div>)/,
    `$1
              {(() => {
                const pi = getLeaguePayment(r.season.league);
                if (!pi) return null;
                const isPaid = r.startingFeePaid === "YES";
                return (
                  <div className="mt-3">
                    <PaymentNotice
                      payment={pi}
                      paid={isPaid}
                      driverName={driverName}
                    />
                  </div>
                );
              })()}$2`
  );
}

if (s === before) {
  console.log('  Already patched.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
JS
node /tmp/lm_reg_page_v2.js

# ============================================================================
# 5. Verify
# ============================================================================
echo ""
echo "=== 5. Verify ==="
echo "-- updateLeague --"
grep -n 'paypalUsername\|registrationFee\b' src/lib/actions/leagues.ts | head -10
echo ""
echo "-- league edit form --"
grep -n 'name="paypalUsername"\|name="registrationFee"' 'src/app/admin/leagues/[slug]/edit/page.tsx' | head -5
echo ""
echo "-- registration form --"
grep -n 'getLeaguePayment\|PaymentNotice' 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' | head -5
echo ""
echo "-- /registrations --"
grep -n 'getLeaguePayment\|PaymentNotice\|driverName' src/app/registrations/page.tsx | head -5

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
git commit -m "Payments: action handles 3 new fields, edit form has fee fieldset, fee banner on register, payment card on /registrations"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
