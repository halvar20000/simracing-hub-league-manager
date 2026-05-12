#!/usr/bin/env bash
# Push 1 - data:
#   - schema: add Registration.excludedAt DateTime?
#   - Kevin Hilgenhövel: status REJECTED -> APPROVED, set excludedAt = now
#   - prisma db push + generate
#   - recompute scoring on every round (no-op for Kevin until iRLM is re-pulled)
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-schema-excludedat.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

const start = s.indexOf("model Registration {");
if (start < 0) { console.error("model Registration not found"); process.exit(1); }
const end = s.indexOf("}", start);
if (end < 0) { console.error("closing brace not found"); process.exit(1); }
const block = s.slice(start, end);

if (/excludedAt\s+DateTime\?/.test(block)) {
  console.log("excludedAt already on Registration; nothing to do.");
} else {
  const insert = "  excludedAt      DateTime?\n";
  s = s.slice(0, end) + insert + s.slice(end);
  fs.writeFileSync(FILE, s);
  console.log("Added Registration.excludedAt to schema.prisma.");
}
EOF
node outputs-tmp/patch-schema-excludedat.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

echo ""
echo "=== Update Kevin's registration ==="
mkdir -p scripts
cat > scripts/exclude-kevin.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { lastName: "Hilgenhövel", firstName: { startsWith: "Kevin" } },
  });
  if (!user) { console.log("Kevin not found"); return; }

  const reg = await prisma.registration.findFirst({
    where: { userId: user.id },
    include: { season: { select: { league: { select: { slug: true } }, name: true } } },
  });
  if (!reg) { console.log("No registration for Kevin"); return; }
  console.log(
    "Found:",
    reg.season.league.slug,
    reg.season.name,
    "current status =",
    reg.status,
    "current excludedAt =",
    reg.excludedAt
  );

  const updated = await prisma.registration.update({
    where: { id: reg.id },
    data: {
      status: "APPROVED",
      excludedAt: reg.excludedAt ?? new Date(),
      approvedAt: reg.approvedAt ?? new Date(),
    },
  });
  console.log(
    "Updated:",
    "status =",
    updated.status,
    "excludedAt =",
    updated.excludedAt?.toISOString()
  );
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/exclude-kevin.ts

echo ""
echo "=== Recompute scoring on every round with results ==="
cat > scripts/recompute-all-rounds.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";
async function main() {
  const rounds = await prisma.round.findMany({
    where: { raceResults: { some: {} } },
    select: { id: true, roundNumber: true, season: { select: { name: true, league: { select: { slug: true } } } } },
    orderBy: [{ season: { league: { slug: "asc" } } }, { season: { name: "asc" } }, { roundNumber: "asc" }],
  });
  for (const r of rounds) {
    await recomputeRoundScoring(prisma, r.id);
    console.log(`Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/recompute-all-rounds.ts

rm -rf outputs-tmp

echo ""
echo "=== Commit and push schema change ==="
git add prisma/schema.prisma
git commit -m "Schema: add Registration.excludedAt for soft-excluded drivers" || echo "(nothing to commit on schema)"
git push

echo ""
echo "Done. NEXT STEP for you:"
echo "  1. Open the admin GT4 TSS S3 round page and click 'Pull from iRLM' on every"
echo "     round you've already pulled — so Kevin's historical results land."
echo "     (He was previously skipped because his status was REJECTED.)"
echo "  2. Then tell me and I'll push the UI strikethrough patch (Push 2)."
