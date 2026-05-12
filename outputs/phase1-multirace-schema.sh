#!/usr/bin/env bash
# Phase 1: schema for multi-race rounds.
#  - RaceResult gains `raceNumber Int @default(1)` and the unique constraint
#    moves from (roundId, registrationId) to (roundId, registrationId, raceNumber).
#  - ScoringSystem gains `racesPerRound Int @default(1)` and `pointsTableRace2 Json?`.
#  - SFL Cup configured: racesPerRound = 2, pointsTable (R1) + pointsTableRace2 (R2).
#  - Every place that upserts on the old unique key is updated to pass raceNumber: 1.
#
# After Phase 1 the existing data is intact and nothing imports race-2 yet.
# Phase 2/3 will inspect iRLM SFL data and extend the importer.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) Schema patches
# ---------------------------------------------------------------
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// (a) Add raceNumber to RaceResult and update its unique constraint.
const rrStart = s.indexOf("model RaceResult {");
if (rrStart < 0) { console.error("RaceResult model missing"); process.exit(1); }
const rrEnd = s.indexOf("}", rrStart);
let rr = s.slice(rrStart, rrEnd);
let changed = false;
if (!/\braceNumber\s+Int\b/.test(rr)) {
  // insert before the closing brace
  rr = rr + "  raceNumber       Int       @default(1)\n";
  changed = true;
}
// Replace old unique with new one
const oldUnique = "@@unique([roundId, registrationId])";
const newUnique = "@@unique([roundId, registrationId, raceNumber])";
if (rr.includes(oldUnique)) {
  rr = rr.replace(oldUnique, newUnique);
  changed = true;
} else if (rr.includes(newUnique)) {
  /* already migrated */
} else {
  console.error("Existing unique constraint @@unique([roundId, registrationId]) not found in RaceResult; please inspect manually.");
  process.exit(1);
}
if (changed) {
  s = s.slice(0, rrStart) + rr + s.slice(rrEnd);
  console.log("RaceResult: raceNumber + new unique constraint applied.");
}

// (b) Add fields to ScoringSystem
const ssStart = s.indexOf("model ScoringSystem {");
const ssEnd = s.indexOf("}", ssStart);
let ss = s.slice(ssStart, ssEnd);
let ssChanged = false;
if (!/racesPerRound\s+Int\b/.test(ss)) {
  ss = ss + "  racesPerRound                 Int       @default(1)\n";
  ssChanged = true;
}
if (!/pointsTableRace2\s+Json\?/.test(ss)) {
  ss = ss + "  pointsTableRace2              Json?\n";
  ssChanged = true;
}
if (ssChanged) {
  s = s.slice(0, ssStart) + ss + s.slice(ssEnd);
  console.log("ScoringSystem: racesPerRound + pointsTableRace2 added.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

# ---------------------------------------------------------------
# 2) Update every place that uses the old unique key to include raceNumber: 1
# ---------------------------------------------------------------
echo ""
echo "=== Updating code that uses the old roundId_registrationId key ==="
cat > outputs-tmp/patch-callsites.mjs <<'EOF'
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      if (e.name === ".next") continue;
      out.push(...walk(p));
    } else if (e.isFile() && /\.(ts|tsx|mjs|js)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

let totalChanged = 0;
for (const f of walk("src")) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;
  // Replace the unique-where shape: roundId_registrationId: { roundId, registrationId: ... }
  //  -> roundId_registrationId_raceNumber: { roundId, registrationId: ..., raceNumber: 1 }
  s = s.replace(
    /roundId_registrationId:\s*\{\s*roundId,\s*registrationId:\s*([^}]+)\}/g,
    "roundId_registrationId_raceNumber: { roundId, registrationId: $1, raceNumber: 1 }"
  );
  if (s !== before) {
    fs.writeFileSync(f, s);
    totalChanged++;
    console.log("  patched:", f);
  }
}
console.log(`Updated ${totalChanged} file(s).`);
EOF
node outputs-tmp/patch-callsites.mjs

# ---------------------------------------------------------------
# 3) Configure SFL Cup scoring system
# ---------------------------------------------------------------
echo ""
echo "=== Configuring CAS SFL Cup with racesPerRound=2 + pointsTables ==="
mkdir -p scripts
cat > scripts/configure-sfl-multirace.ts <<'EOF'
import { prisma } from "@/lib/prisma";

const RACE1: Record<string, number> = {
  "1": 25, "2": 22, "3": 19, "4": 17, "5": 16, "6": 15, "7": 14,
  "8": 13, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};
const RACE2: Record<string, number> = {
  "1": 30, "2": 27, "3": 24, "4": 22, "5": 20, "6": 18, "7": 16,
  "8": 14, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};

async function main() {
  const ss = await prisma.scoringSystem.findUnique({ where: { name: "CAS SFL Cup" } });
  if (!ss) throw new Error("CAS SFL Cup scoring system not found");
  await prisma.scoringSystem.update({
    where: { id: ss.id },
    data: {
      racesPerRound: 2,
      pointsTable: RACE1,
      pointsTableRace2: RACE2,
    },
  });
  console.log("CAS SFL Cup configured: racesPerRound=2, pointsTable (R1) + pointsTableRace2 (R2) updated.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/configure-sfl-multirace.ts

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 4) Sanity output + commit
# ---------------------------------------------------------------
echo ""
echo "=== Sanity ==="
echo "--- RaceResult model ---"
awk '/^model RaceResult \{/,/^\}/' prisma/schema.prisma
echo ""
echo "--- ScoringSystem model (last 10 lines) ---"
awk '/^model ScoringSystem \{/{flag=1} flag; /^\}/{if(flag){flag=0; exit}}' prisma/schema.prisma | tail -10

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Phase 1 multirace: RaceResult.raceNumber + ScoringSystem.racesPerRound/pointsTableRace2 (SFL=2)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Verify build is green. No visible behaviour change yet — existing data has"
echo "raceNumber=1, every importer call now passes raceNumber:1, SFL is configured"
echo "but its importer still only writes one RaceResult per round."
echo ""
echo "Next: Phase 2 — inspect iRLM SFL event response so we know the session shape."
