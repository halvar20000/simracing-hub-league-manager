#!/usr/bin/env bash
# Find the most recent image you uploaded to chat, copy it to
# public/schedules/ in the league-manager repo, set Season.scheduleImageUrl
# on GT3 WCT 12th Season, commit + push.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

UPLOADS="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/4f20476b-d7c7-41be-92dd-80316cf39863/0df53c3c-efef-4a90-a396-23f26e09cdf9/local_b222b9b9-ee6f-4bd4-b847-c691375bf876/uploads"

echo "=== Existing schedules folder ==="
ls -la public/schedules/ 2>/dev/null || mkdir -p public/schedules

echo ""
echo "=== Most recent images in your uploads folder ==="
LATEST=$(find "$UPLOADS" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) -print0 2>/dev/null | xargs -0 ls -lt 2>/dev/null | head -5 || true)
echo "$LATEST"

# Pick the newest image
PICK=$(find "$UPLOADS" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)
if [ -z "$PICK" ]; then
  echo ""
  echo "No image files found in uploads folder. Save the schedule image to a"
  echo "known path (e.g., ~/Downloads/gt3-wct-12-schedule.png) and edit this"
  echo "script to point at that path."
  exit 1
fi
echo ""
echo "Using newest image: $PICK"

# Detect extension
EXT="${PICK##*.}"
EXT_LC=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
DEST_NAME="gt3-wct-12.${EXT_LC}"
DEST="public/schedules/${DEST_NAME}"

cp "$PICK" "$DEST"
echo "Copied -> $DEST"

# Update the GT3 WCT 12th Season's scheduleImageUrl
mkdir -p scripts
cat > scripts/set-wct-schedule.ts <<EOF
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
    data: { scheduleImageUrl: "/schedules/${DEST_NAME}" },
  });
  console.log("scheduleImageUrl set to /schedules/${DEST_NAME}");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/set-wct-schedule.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Add GT3 WCT 12th Season schedule image"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Visit /leagues/cas-gt3-wct/seasons/<id> — the schedule image should"
echo "    render anywhere the season page reads scheduleImageUrl."
