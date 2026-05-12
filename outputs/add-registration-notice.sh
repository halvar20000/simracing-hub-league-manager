#!/usr/bin/env bash
# Add a per-league registrationNotice field, set the PCCD entry-fee text,
# and show the notice in red+bold on the registration page.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Add registrationNotice field to League model (idempotent)
# ------------------------------------------------------------
echo ">>> Adding registrationNotice to League model..."
node -e "
const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('registrationNotice')) {
  console.log('  Already present — skipping schema edit.');
} else {
  s = s.replace(
    /(model League \{[\s\S]*?logoUrl\s+String\?)/,
    '\$1\n  registrationNotice String?'
  );
  fs.writeFileSync(p, s);
  console.log('  Added registrationNotice field.');
}
"

# ------------------------------------------------------------
# 2. Push schema + regenerate client
# ------------------------------------------------------------
echo ">>> Pushing schema to Neon..."
npx prisma db push
npx prisma generate

# ------------------------------------------------------------
# 3. Set notice on the CAS PCCD league
# ------------------------------------------------------------
echo ">>> Setting PCCD registration notice..."
mkdir -p scripts
cat > scripts/set-pccd-notice.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PCCD_NOTICE =
  "With the registration I agree to the regulations and I confirm that I will pay the entry fee of 10€. " +
  "The entry fee must be paid by PayPal (using the Friends and Family option) to the username deepwu, " +
  "stating the original driver's name.";

async function main() {
  const result = await prisma.league.updateMany({
    where: { slug: "cas-pccd" },
    data: { registrationNotice: PCCD_NOTICE },
  });
  console.log(
    result.count > 0
      ? "PCCD registration notice set."
      : "League cas-pccd not found."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF
npx tsx scripts/set-pccd-notice.ts

# ------------------------------------------------------------
# 4. Update the registration page to display the notice
# ------------------------------------------------------------
echo ">>> Updating registration page..."

# Use node to insert the notice block after the existing isUpdate notice
node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(path, 'utf8');

// Replace the existing 'You already have...' notice block with itself + notice block right after
const marker = 'Submitting will reset it to PENDING for re-approval.';
if (!s.includes('season.league.registrationNotice')) {
  s = s.replace(
    /(\{isUpdate &&[\s\S]*?Submitting will reset it to PENDING for re-approval\.\s*<\/div>\s*\)\})/,
    \`\$1

      {season.league.registrationNotice && (
        <div className=\"rounded border border-red-700 bg-red-950/40 p-3 text-sm font-bold text-red-300\">
          {season.league.registrationNotice}
        </div>
      )}\`
  );
  fs.writeFileSync(path, s);
  console.log('  Inserted notice block.');
} else {
  console.log('  Notice block already present.');
}
"

echo ""
echo "Done. Refresh the CAS PCCD registration page to see the entry-fee notice."
echo "When ready, push to deploy:"
echo "  git add -A && git commit -m 'Add per-league registration notice (PCCD entry fee)' && git push"
