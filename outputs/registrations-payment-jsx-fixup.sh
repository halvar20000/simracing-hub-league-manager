#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/registrations/page.tsx'

echo "=== Add PaymentNotice JSX into each /registrations card ==="
cat > /tmp/lm_reg_jsx.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Specific check: look for the JSX usage, not the import
if (s.includes('<PaymentNotice')) {
  console.log('  JSX already present.');
  process.exit(0);
}

// Insert into the registration card right before its closing </div>.
// Anchor: capture the opening of the card up to its closing </div></)).
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

if (s === before) {
  console.error('  Anchor not found — paste me the registration card structure.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_reg_jsx.js "$FILE"

echo ""
echo "-- Verify --"
grep -n '<PaymentNotice' "$FILE" | head -5

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
git commit -m "Payments: render PaymentNotice JSX inside each /registrations card (the import was there but the JSX got skipped)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, /registrations will show the pending or paid PayPal card"
echo "for any registration where the league has a fee configured."
