#!/usr/bin/env bash
# Two diagnostics:
#   1. Print the top 10 RaceResult rows of the latest round so we can see
#      whether qualifyingTimeMs / startPosition are populated.
#   2. Dump the admin round page so I can see exactly how the results table
#      is rendered and write a precise UI patch.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

ROUND_ID="cmoh235mi000130mrqu83apqo"
PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

# ---- 1. Data check via Prisma client ----
mkdir -p scripts
cat > scripts/check-quali-data.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const ROUND_ID = process.env.ROUND_ID!;

async function main() {
  const rows = await prisma.raceResult.findMany({
    where: { roundId: ROUND_ID },
    orderBy: { finishPosition: "asc" },
    take: 10,
    select: {
      finishPosition: true,
      startPosition: true,
      qualifyingTimeMs: true,
      bestLapTimeMs: true,
      registration: { select: { user: { select: { iracingMemberId: true } } } },
    },
  });
  console.log("Top 10 rows of round:", ROUND_ID);
  for (const r of rows) {
    console.log(
      "  Pos",
      String(r.finishPosition).padStart(2, " "),
      "| Grid",
      r.startPosition ?? "-",
      "| Quali ms",
      r.qualifyingTimeMs ?? "-",
      "| Best ms",
      r.bestLapTimeMs ?? "-",
      "| custId",
      r.registration?.user?.iracingMemberId ?? "?"
    );
  }
}
main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
EOF

echo "=== 1. Data check (top 10 rows) ==="
ROUND_ID="$ROUND_ID" npx tsx scripts/check-quali-data.ts

# ---- 2. Page structure dump ----
echo ""
echo "=== 2. Round page line counts and import block ==="
wc -l "$PAGE"
echo ""
echo "First 25 lines (imports + top of file):"
sed -n '1,25p' "$PAGE"

echo ""
echo "Lines mentioning the key tokens (table / form fields):"
grep -n -E '<table|<thead|<tbody|<tr|finishPosition|bestLapTimeMs|incidents|iRating|name="finishPosition"|upsertRaceResult|formatMsToTime' "$PAGE" | head -80
