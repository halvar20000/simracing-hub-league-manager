#!/usr/bin/env bash
# Copy the WCT schedule image from Downloads into the repo, set
# Season.scheduleImageUrl on GT3 WCT 12th Season, push.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SRC="$HOME/Downloads/cas-gt3-wct-season-12.png"
if [ ! -f "$SRC" ]; then
  echo "Could not find $SRC"
  echo ""
  echo "Save the image to that path first (right-click in chat -> Save Image As)."
  exit 1
fi

mkdir -p public/schedules
DEST="public/schedules/cas-gt3-wct-season-12.png"
cp "$SRC" "$DEST"
echo "Copied -> $DEST"

mkdir -p scripts
cat > scripts/set-wct-schedule.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) throw new Error("cas-gt3-wct league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) throw new Error("WCT 2026 season not found");
  console.log("Updating season:", season.id, season.name);
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/cas-gt3-wct-season-12.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/set-wct-schedule.ts

git add -A
git commit -m "Add GT3 WCT 12th Season schedule image"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
