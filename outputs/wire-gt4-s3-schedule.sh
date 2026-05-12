#!/usr/bin/env bash
# Copy the GT4 TSS Masters S3 schedule image from Downloads into the repo,
# set Season.scheduleImageUrl on GT4 TSS Masters 3rd Season, push.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SRC="$HOME/Downloads/GT4_TSS_Schedule-Season-3.png"
if [ ! -f "$SRC" ]; then
  echo "Could not find $SRC"
  echo ""
  echo "Save the image to that path first."
  exit 1
fi

mkdir -p public/schedules
DEST="public/schedules/GT4_TSS_Schedule-Season-3.png"
cp "$SRC" "$DEST"
echo "Copied -> $DEST"

mkdir -p scripts
cat > scripts/set-gt4-s3-schedule.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-tss-gt4" } });
  if (!league) throw new Error("cas-tss-gt4 league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, name: "3rd Season", year: 2026 },
  });
  if (!season) throw new Error("GT4 TSS 3rd Season not found");
  console.log("Updating season:", season.id, season.name);
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/GT4_TSS_Schedule-Season-3.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/set-gt4-s3-schedule.ts

git add -A
git commit -m "Add GT4 TSS Masters 3rd Season schedule image"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
