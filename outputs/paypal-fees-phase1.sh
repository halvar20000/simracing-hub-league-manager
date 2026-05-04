#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: add paypalUsername / registrationFee / registrationFeeCurrency
#    to League. (League-level — applies to every season in the league.)
# ============================================================================
echo "=== 1. Schema ==="
cat > /tmp/lm_paypal_schema.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const re = /(model League \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  League model not found.'); process.exit(1); }
let body = m[1];
let added = false;
if (!/paypalUsername\s+String\?/.test(body)) {
  body += '\n  paypalUsername          String?';
  added = true;
}
if (!/registrationFee\s+Int\?/.test(body)) {
  body += '\n  registrationFee         Int?';
  added = true;
}
if (!/registrationFeeCurrency\s+String\?/.test(body)) {
  body += '\n  registrationFeeCurrency String?  @default("EUR")';
  added = true;
}
if (added) {
  s = s.replace(re, body + m[2]);
  fs.writeFileSync(FILE, s);
  console.log('  Added payment fields to League.');
} else {
  console.log('  Already present.');
}
JS
node /tmp/lm_paypal_schema.js

# ============================================================================
# 2. Push schema and regen client
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Initial data: set known leagues + list all so PCCD can be done after
# ============================================================================
echo ""
echo "=== 3. Set initial PayPal data ==="
cat > ./_seed_paypal.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Known leagues
  const r1 = await p.league.updateMany({
    where: { slug: 'cas-gt3-wct' },
    data: {
      paypalUsername: 'auro2082',
      registrationFee: 10,
      registrationFeeCurrency: 'EUR',
    },
  });
  console.log('  cas-gt3-wct       updated=' + r1.count);

  const r2 = await p.league.updateMany({
    where: { slug: 'cas-tss-gt4' },
    data: {
      paypalUsername: 'deepwu',
      registrationFee: 10,
      registrationFeeCurrency: 'EUR',
    },
  });
  console.log('  cas-tss-gt4       updated=' + r2.count);

  // Try to find PCCD by name
  const pccd = await p.league.findMany({
    where: {
      OR: [
        { slug: { contains: 'pccd' } },
        { name: { contains: 'PCCD' } },
        { name: { contains: 'Porsche', mode: 'insensitive' } },
      ],
    },
  });
  if (pccd.length > 0) {
    for (const lg of pccd) {
      await p.league.update({
        where: { id: lg.id },
        data: {
          paypalUsername: 'deepwu',
          registrationFee: 10,
          registrationFeeCurrency: 'EUR',
        },
      });
      console.log('  ' + lg.slug.padEnd(18) + ' updated (matched: ' + lg.name + ')');
    }
  } else {
    console.log('  PCCD not auto-detected — set it from the League edit page once deployed.');
  }

  console.log('');
  console.log('All leagues + payment state:');
  const all = await p.league.findMany({
    orderBy: { name: 'asc' },
    select: {
      slug: true,
      name: true,
      paypalUsername: true,
      registrationFee: true,
      registrationFeeCurrency: true,
    },
  });
  for (const l of all) {
    const fee = l.registrationFee
      ? l.registrationFee + ' ' + (l.registrationFeeCurrency ?? 'EUR')
      : '—';
    console.log('  ' + l.slug.padEnd(28) + ' fee=' + fee.padEnd(8) + ' paypal=' + (l.paypalUsername ?? '—'));
  }
  await p.$disconnect();
})();
JS
node ./_seed_paypal.cjs
rm ./_seed_paypal.cjs

# ============================================================================
# 4. Helper lib: src/lib/payment.ts
# ============================================================================
echo ""
echo "=== 4. Create src/lib/payment.ts ==="
cat > src/lib/payment.ts <<'TS'
export interface PaymentInfo {
  amount: number;
  currency: string;
  paypalUrl: string | null;
}

export function getLeaguePayment(league: {
  registrationFee: number | null;
  registrationFeeCurrency: string | null;
  paypalUsername: string | null;
}): PaymentInfo | null {
  if (!league.registrationFee || league.registrationFee <= 0) return null;
  const currency = league.registrationFeeCurrency ?? "EUR";
  const paypalUrl = league.paypalUsername
    ? `https://paypal.me/${league.paypalUsername}/${league.registrationFee}${currency}`
    : null;
  return {
    amount: league.registrationFee,
    currency,
    paypalUrl,
  };
}
TS
echo "  Written."

# ============================================================================
# 5. Reusable PaymentNotice component
# ============================================================================
echo ""
echo "=== 5. Create src/components/PaymentNotice.tsx ==="
cat > src/components/PaymentNotice.tsx <<'TSX'
import type { PaymentInfo } from "@/lib/payment";

export default function PaymentNotice({
  payment,
  paid,
  driverName,
  variant = "pending",
}: {
  payment: PaymentInfo;
  paid?: boolean;
  driverName?: string | null;
  variant?: "preview" | "pending";
}) {
  if (paid) {
    return (
      <div className="rounded border border-emerald-700/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        Registration fee paid: {payment.amount} {payment.currency} ✓
      </div>
    );
  }

  if (variant === "preview") {
    return (
      <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm">
        <p className="font-semibold text-amber-100">
          Registration fee: {payment.amount} {payment.currency}
        </p>
        <p className="mt-1 text-xs text-amber-200">
          After registering, you&apos;ll see a PayPal link with payment
          instructions. Send as <strong>Friends &amp; Family</strong> with your
          real name in the message field.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 space-y-2">
      <p className="font-semibold text-amber-100">
        Registration fee pending: {payment.amount} {payment.currency}
      </p>
      <ul className="list-disc pl-5 text-xs text-amber-200 space-y-1">
        <li>
          Send via PayPal as <strong>Friends &amp; Family</strong> (so no fees
          are deducted).
        </li>
        <li>
          Add your real name
          {driverName ? <> (<strong>{driverName}</strong>)</> : null} in the
          message field as reference, so the admin can match the payment to
          your registration.
        </li>
      </ul>
      {payment.paypalUrl ? (
        <a
          href={payment.paypalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Pay {payment.amount} {payment.currency} via PayPal →
        </a>
      ) : (
        <p className="text-xs text-amber-300">
          PayPal link not configured for this league. Ask the admin for
          payment instructions.
        </p>
      )}
    </div>
  );
}
TSX
echo "  Written."

# ============================================================================
# 6. Update updateLeague action to save the 3 new fields
# ============================================================================
echo ""
echo "=== 6. Patch updateLeague action ==="
cat > /tmp/lm_update_league.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/leagues.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Already patched?
if (s.includes('paypalUsername:')) {
  console.log('  Already handles paypalUsername.');
  process.exit(0);
}

// Strategy: locate the prisma.league.update({ ... data: { ... } }) call inside
// updateLeague and append the three new fields to its data payload. Anchor on
// the closing `},` of the data block — the line right after the last field.
// Most reliable: find the field set we know exists (registrationNotifyEmails).
const re = /(registrationNotifyEmails:\s*[^,\n]+,)/;
if (!re.test(s)) {
  console.error('  Cannot find registrationNotifyEmails anchor in updateLeague.');
  process.exit(1);
}

s = s.replace(
  re,
  `$1
      paypalUsername: paypalUsername || null,
      registrationFee: registrationFeeNum,
      registrationFeeCurrency: registrationFeeCurrency || "EUR",`
);

// Add the parsing of the three new fields near the top of the function,
// alongside the existing String(formData.get(...)) lines. Anchor on the
// existing parse for discordRegistrationsWebhookUrl.
const reParse = /(const discordRegistrationsWebhookUrl = String\(formData\.get\("discordRegistrationsWebhookUrl"\) \?\? ""\)\.trim\(\);)/;
if (!reParse.test(s)) {
  console.error('  Cannot find discordRegistrationsWebhookUrl parse anchor.');
  process.exit(1);
}
s = s.replace(
  reParse,
  `$1
  const paypalUsername = String(formData.get("paypalUsername") ?? "").trim();
  const registrationFeeRaw = String(formData.get("registrationFee") ?? "").trim();
  const registrationFeeNum =
    registrationFeeRaw && /^\\d+$/.test(registrationFeeRaw)
      ? parseInt(registrationFeeRaw, 10)
      : null;
  const registrationFeeCurrency = String(
    formData.get("registrationFeeCurrency") ?? ""
  )
    .trim()
    .toUpperCase();`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_update_league.js

# ============================================================================
# 7. Add the 3 new fields to the League edit form
# ============================================================================
echo ""
echo "=== 7. Patch league edit page ==="
cat > /tmp/lm_league_edit.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/edit/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('name="paypalUsername"')) {
  console.log('  Already present.');
  process.exit(0);
}
const before = s;

// Anchor: insert just after the Discord webhook URL <label> — that label is
// followed by closing </label>. Find the closing </label> for the discord URL
// field and insert our new fields right after it.
s = s.replace(
  /(name="discordRegistrationsWebhookUrl"[\s\S]*?<\/label>)/,
  `$1

        <fieldset className="rounded border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <legend className="px-2 text-sm text-zinc-300">
            Registration fee (optional)
          </legend>
          <p className="text-xs text-zinc-500">
            If set, drivers will see a PayPal payment link after registering.
            Send as Friends &amp; Family + real name as reference is shown
            automatically.
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
  console.error('  Anchor not found in league edit page.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_league_edit.js

# ============================================================================
# 8. Driver-facing: registration form fee banner before submit
# ============================================================================
echo ""
echo "=== 8. Patch registration form: fee banner before submit ==="
cat > /tmp/lm_register_fee.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Imports
if (!s.includes('getLeaguePayment')) {
  s = s.replace(
    /import \{ createRegistration \} from "@\/lib\/actions\/registrations";/,
    `import { createRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";`
  );
}

// (b) Compute payment info before the return — anchor on the existing
//     hasCars compute we added earlier.
if (!s.includes('const paymentInfo = getLeaguePayment')) {
  s = s.replace(
    /(const hasCars = carClasses\.some\(\(cc\) => cc\.cars\.length > 0\);)/,
    `$1
  const paymentInfo = getLeaguePayment(season.league);`
  );
}

// (c) Insert the preview banner immediately before the submit button area.
//     Anchor: the <div className="flex gap-2"> that wraps the submit button.
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
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_register_fee.js

# ============================================================================
# 9. /registrations: pending payment notice per registration
# ============================================================================
echo ""
echo "=== 9. Patch /registrations page ==="
cat > /tmp/lm_registrations_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/registrations/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Imports
if (!s.includes('getLeaguePayment')) {
  s = s.replace(
    /import \{ withdrawRegistration \} from "@\/lib\/actions\/registrations";/,
    `import { withdrawRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";`
  );
}

// (b) Fetch user firstName/lastName so we can pass real name to PaymentNotice.
//     Add a user lookup just after registrations findMany.
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

// (c) Insert the payment notice inside each registration card. Anchor on the
//     closing </div> of the card's "flex flex-wrap items-start justify-between"
//     section — that's the structured header. Insert AFTER it (i.e. inside
//     the same parent card).
//     Easiest: insert between the existing card body and the card's closing
//     </div>. Anchor: the existing `key={r.id}` <div ... > opening + content.
if (!s.includes('PaymentNotice')) {
  // Find the closing </div> of the entire card (the one with key={r.id}).
  // We'll insert before that closing </div> so the notice appears at the
  // bottom of each card.
  s = s.replace(
    /(<div\s*\n?\s*key=\{r\.id\}\s*\n?\s*className="rounded border border-zinc-800 bg-zinc-900 p-4"\s*\n?\s*>[\s\S]*?)(\n\s*<\/div>\s*\n\s*\)\)\}\s*\n\s*<\/div>)/,
    `$1
              {(() => {
                const pi = getLeaguePayment(r.season.league);
                if (!pi) return null;
                if (r.startingFeePaid === "YES") return (
                  <div className="mt-3">
                    <PaymentNotice payment={pi} paid driverName={driverName} />
                  </div>
                );
                return (
                  <div className="mt-3">
                    <PaymentNotice payment={pi} driverName={driverName} />
                  </div>
                );
              })()}$2`
  );
}

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_registrations_page.js

# ============================================================================
# 10. Verify
# ============================================================================
echo ""
echo "=== 10. Verify ==="
echo "-- schema --"
grep -n 'paypalUsername\|registrationFee' prisma/schema.prisma | head -5
echo ""
echo "-- payment lib + component --"
ls -la src/lib/payment.ts src/components/PaymentNotice.tsx
echo ""
echo "-- registration form anchors --"
grep -n 'getLeaguePayment\|PaymentNotice' src/app/leagues/\[slug\]/seasons/\[seasonId\]/register/page.tsx | head -5
echo ""
echo "-- /registrations page anchors --"
grep -n 'getLeaguePayment\|PaymentNotice\|driverName' src/app/registrations/page.tsx | head -5
echo ""
echo "-- league edit form --"
grep -n 'paypalUsername\|registrationFee' 'src/app/admin/leagues/[slug]/edit/page.tsx' | head -5

# ============================================================================
# 11. TS check
# ============================================================================
echo ""
echo "=== 11. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 12. Commit + push
# ============================================================================
echo ""
echo "=== 12. Commit + push ==="
git add -A
git status --short
git commit -m "Payments: per-league PayPal config, fee banner on register, payment card on /registrations"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "What's now live:"
echo "  • League edit page has Registration fee + PayPal username fields"
echo "  • GT3 WCT, GT4 TSS already seeded with 10 EUR + auro2082 / deepwu"
echo "  • PCCD: scroll the leagues list above; if not auto-detected, set"
echo "    deepwu via the admin League edit page"
echo "  • Registration form: amber 'Registration fee' banner before submit"
echo "  • /registrations: each registration card has either a green 'paid'"
echo "    notice or an amber pending notice with the PayPal.me link, F&F"
echo "    instruction, and real-name reference reminder"
echo ""
echo "Phase 2 (next): include the payment URL in the existing Discord webhook"
echo "and email notifications, so admins see the link on each registration."
