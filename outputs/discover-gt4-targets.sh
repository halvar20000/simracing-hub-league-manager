#!/usr/bin/env bash
# Discovery for the GT4 Masters S3 setup:
#   - Print Season / User / Team / Registration / ScoringSystem / RoundStatus
#     schema fragments so the create script matches field names exactly.
#   - Check whether a TSS GT4 Masters league exists.
#   - Look up which iRacing IDs from the CSV already exist as Users.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts

echo "=== Schema fragments ==="
for model in Season User Team Registration ScoringSystem; do
  echo ""
  echo "--- model $model ---"
  awk -v m="$model" '
    BEGIN { f=0 }
    $0 ~ "^model "m" \\{" { f=1; print; next }
    f && /^\}/ { print; f=0; next }
    f { print }
  ' prisma/schema.prisma
done

echo ""
echo "--- enum RegistrationStatus ---"
awk '/^enum RegistrationStatus \{/,/^\}/' prisma/schema.prisma

echo ""
echo "--- enum RoundStatus ---"
awk '/^enum RoundStatus \{/,/^\}/' prisma/schema.prisma

echo ""
echo "=== Existing data in DB ==="

cat > scripts/discover-gt4.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const IRACING_IDS = [
  "445964","583549","915496","1005962","1057110","718865","172159","479423",
  "838203","115215","946603","250311","350029","1387737","693261","1380833",
  "181516","891101","564275","1150978","845397","841424","249259","727299",
  "709942","844831","586530","303625","436580","916335","348458","48914","965844",
];

async function main() {
  const leagues = await prisma.league.findMany({
    select: { id: true, name: true, slug: true, _count: { select: { seasons: true } } },
  });
  console.log("All leagues:");
  for (const l of leagues) console.log(" ", l);

  const tssLike = leagues.filter((l) =>
    /tss|gt4|masters/i.test(l.name) || /tss|gt4|masters/i.test(l.slug)
  );
  console.log("Leagues that look TSS / GT4 / Masters:", tssLike);

  const scoringSystems = await prisma.scoringSystem.findMany({
    select: { id: true, name: true, participationPoints: true },
  });
  console.log("Scoring systems:");
  for (const s of scoringSystems) console.log(" ", s);

  const matchedUsers = await prisma.user.findMany({
    where: { iracingMemberId: { in: IRACING_IDS } },
    select: { iracingMemberId: true, firstName: true, lastName: true },
  });
  console.log(`Existing users matching CSV iRacing IDs: ${matchedUsers.length} / ${IRACING_IDS.length}`);
  for (const u of matchedUsers) console.log(" ", u);

  const missingIds = IRACING_IDS.filter(
    (id) => !matchedUsers.some((u) => u.iracingMemberId === id)
  );
  console.log("Missing iRacing IDs (will create new Users):", missingIds.length);
  console.log(" ", missingIds.slice(0, 10).join(", "), missingIds.length > 10 ? "..." : "");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF

npx tsx scripts/discover-gt4.ts
