#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Latest commit (must match Vercel's deployed commit) ==="
git log -3 --oneline
echo "HEAD: $(git rev-parse HEAD)"
echo ""
echo "Is homepage commit pushed? Check 'origin/main' matches:"
git rev-parse origin/main || true

echo ""
echo "=== 2. First 30 lines of src/app/page.tsx (should reference NextRaceHero) ==="
sed -n '1,30p' src/app/page.tsx

echo ""
echo "=== 3. countryCode populated counts ==="
mkdir -p scripts
cat > scripts/diag-flags.ts <<'EOF'
import { prisma } from "@/lib/prisma";
async function main() {
  const total = await prisma.user.count();
  const withCC = await prisma.user.count({ where: { countryCode: { not: null } } });
  console.log(`Users total: ${total}`);
  console.log(`Users with countryCode set: ${withCC}`);
  const sample = await prisma.user.findMany({
    where: { countryCode: { not: null } },
    select: { firstName: true, lastName: true, countryCode: true },
    take: 5,
  });
  console.log("Sample:", sample);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/diag-flags.ts
