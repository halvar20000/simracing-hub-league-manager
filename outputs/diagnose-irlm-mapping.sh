#!/usr/bin/env bash
# Print both sides of the iRLM <-> local roster mapping so we can see
# why 91 rows were skipped:
#   1. The unmatched memberIds from the most recent iRLM pull (errorLog)
#   2. The iracingMemberId values currently stored on approved registrations
#      for this season.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SEASON_ID="cmoeftuep0009lb04dlxe44ad"   # CAS GT3 WCT season 12 (from your URL)
ROUND_ID="cmoh235mi000130mrqu83apqo"    # the round you just pulled

mkdir -p scripts
cat > scripts/diagnose-irlm-mapping.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const SEASON_ID = process.env.SEASON_ID!;
const ROUND_ID = process.env.ROUND_ID!;

async function main() {
  console.log("=== Latest iRLM pull import for this round ===");
  const latest = await prisma.csvImport.findFirst({
    where: { roundId: ROUND_ID, originalFilename: { startsWith: "iRLM-pull-" } },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) {
    console.log("No iRLM pull import row found for this round.");
  } else {
    console.log("CsvImport id:", latest.id);
    console.log("Imported:", latest.rowsImported, "  Skipped:", latest.rowsSkipped);
    const log = latest.errorLog as
      | { memberId: string; reason: string }[]
      | null;
    if (Array.isArray(log)) {
      const memberIds = Array.from(
        new Set(log.map((r) => r.memberId).filter(Boolean))
      ).sort();
      console.log("Distinct unmatched iRLM memberIds:", memberIds.length);
      console.log(memberIds.slice(0, 30).join(", "));
      if (memberIds.length > 30) console.log("... (truncated)");
    }
  }

  console.log("\n=== Approved registrations on this season ===");
  const regs = await prisma.registration.findMany({
    where: { seasonId: SEASON_ID, status: "APPROVED" },
    include: { user: true },
  });
  console.log("Approved registrations:", regs.length);
  let withId = 0;
  let withoutId = 0;
  const sampleIds: string[] = [];
  for (const r of regs) {
    if (r.user?.iracingMemberId) {
      withId++;
      if (sampleIds.length < 30) sampleIds.push(r.user.iracingMemberId);
    } else {
      withoutId++;
    }
  }
  console.log("With iracingMemberId    :", withId);
  console.log("Without iracingMemberId :", withoutId);
  console.log("Sample iracingMemberIds :", sampleIds.join(", "));

  // Quick "do they actually look the same shape?" check
  if (latest && Array.isArray(latest.errorLog)) {
    const log = latest.errorLog as { memberId: string; reason: string }[];
    const irlmIds = new Set(log.map((r) => r.memberId).filter(Boolean));
    const dbIds = new Set(
      regs.map((r) => r.user?.iracingMemberId).filter(Boolean) as string[]
    );
    const overlapExact = [...irlmIds].filter((id) => dbIds.has(id));
    console.log("\nExact-string overlap:", overlapExact.length);
    // Try comparing as numbers, in case one side has leading zeros / spaces
    const numIrlm = new Set(
      [...irlmIds].map((s) => String(parseInt(String(s), 10)))
    );
    const numDb = new Set(
      [...dbIds].map((s) => String(parseInt(String(s), 10)))
    );
    const overlapNum = [...numIrlm].filter((id) => numDb.has(id));
    console.log("Numeric-equality overlap:", overlapNum.length);
    if (overlapNum.length > 0 && overlapExact.length === 0) {
      console.log(
        ">>> Format mismatch: same numbers, different string shape (whitespace / leading zeros)."
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
EOF

echo "Wrote scripts/diagnose-irlm-mapping.ts"
echo ""
echo "Running it against your dev/local DB (uses .env):"
SEASON_ID="$SEASON_ID" ROUND_ID="$ROUND_ID" npx tsx scripts/diagnose-irlm-mapping.ts
