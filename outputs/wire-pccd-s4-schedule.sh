#!/usr/bin/env bash
# Copy the PCCD S4 schedule image from Downloads into the repo, set
# Season.scheduleImageUrl on the renamed "4th season CAS Porsche Community CUP".
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SRC="$HOME/Downloads/CAS-PCup-Season-4.png"
if [ ! -f "$SRC" ]; then
  echo "Could not find $SRC"
  echo ""
  echo "Save the image to that path first."
  exit 1
fi

mkdir -p public/schedules
DEST="public/schedules/CAS-PCup-Season-4.png"
cp "$SRC" "$DEST"
echo "Copied -> $DEST"

mkdir -p scripts
cat > scripts/set-pccd-s4-schedule.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) throw new Error("cas-pccd league not found");
  // Find the season whose name contains "4th" (case-insensitive)
  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id, year: 2026 },
  });
  const target =
    seasons.find((s) => /\b4th\b/i.test(s.name)) ??
    seasons.find((s) => s.name.includes("04"));
  if (!target) {
    console.error("No 4th-season match. Existing PCCD 2026 seasons:");
    for (const s of seasons) console.error(" ", s.id, s.name);
    process.exit(1);
  }
  console.log("Updating season:", target.id, target.name);
  await prisma.season.update({
    where: { id: target.id },
    data: { scheduleImageUrl: "/schedules/CAS-PCup-Season-4.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/set-pccd-s4-schedule.ts

git add -A
git commit -m "Add PCCD 4th Season schedule image"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
