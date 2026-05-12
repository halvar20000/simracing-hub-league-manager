#!/usr/bin/env bash
# Copy the SFL Cup S7 schedule image from Downloads into the repo, set
# Season.scheduleImageUrl on the SFL Cup 7th Season, push.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SRC="$HOME/Downloads/cas-SFL-season-7.png"
if [ ! -f "$SRC" ]; then
  echo "Could not find $SRC"
  echo ""
  echo "Save the image to that path first."
  exit 1
fi

mkdir -p public/schedules
DEST="public/schedules/cas-SFL-season-7.png"
cp "$SRC" "$DEST"
echo "Copied -> $DEST"

mkdir -p scripts
cat > scripts/set-sfl-schedule.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  if (!league) throw new Error("cas-sfl-cup league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) throw new Error("SFL 2026 season not found");
  console.log("Updating season:", season.id, season.name);
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/cas-SFL-season-7.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/set-sfl-schedule.ts

git add -A
git commit -m "Add SFL Cup 7th Season schedule image"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
