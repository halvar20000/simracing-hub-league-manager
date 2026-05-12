#!/usr/bin/env bash
# Phase 3 (back-end complete):
#   - scoring.ts: per-race points table; participation deduped per round
#   - irlm-import.ts: maps session "Race 1"/"Race 2" -> raceNumber 1/2;
#                    skips "Combined" iRLM session
#   - standings.ts: per-round aggregation across all RaceResults
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------
# 1) Replace src/lib/scoring.ts with multi-race-aware version
# ---------------------------------------------------------------
cat > src/lib/scoring.ts <<'EOF'
import type {
  PrismaClient,
  FinishStatus,
} from "@prisma/client";

export interface PointsTable {
  [position: string]: number;
}

export interface FPRTier {
  max: number;
  points: number;
}

/**
 * Position points based on finish position and finish status.
 * Only CLASSIFIED finishes earn position points.
 */
export function calculateRawPoints(
  finishPosition: number,
  finishStatus: FinishStatus,
  pointsTable: PointsTable
): number {
  if (finishStatus !== "CLASSIFIED") return 0;
  if (finishPosition < 1) return 0;
  return pointsTable[String(finishPosition)] ?? 0;
}

/**
 * Participation points if driver finished at least the minimum %
 * of race distance and didn't DNS.
 */
export function calculateParticipationPoints(
  raceDistancePct: number,
  finishStatus: FinishStatus,
  participationPoints: number,
  participationMinDistancePct: number
): number {
  if (finishStatus === "DNS") return 0;
  if (raceDistancePct < participationMinDistancePct) return 0;
  return participationPoints;
}

/**
 * Recompute the points for a single race result and persist the new values.
 * Picks the correct points table based on raceNumber (race 1 uses
 * pointsTable; race 2 uses pointsTableRace2 if set, falling back to pointsTable).
 *
 * Note: participationPointsAwarded is NOT set here — it's awarded once per
 * (round, registration) by recomputeRoundScoring to avoid double-counting
 * across multi-race rounds.
 */
export async function recomputeResultPoints(
  prisma: PrismaClient,
  resultId: string
): Promise<void> {
  const result = await prisma.raceResult.findUnique({
    where: { id: resultId },
    include: {
      round: {
        include: { season: { include: { scoringSystem: true } } },
      },
    },
  });
  if (!result) return;

  const scoring = result.round.season.scoringSystem;
  const pointsTable =
    result.raceNumber > 1 && scoring.pointsTableRace2
      ? (scoring.pointsTableRace2 as PointsTable)
      : (scoring.pointsTable as PointsTable);

  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    pointsTable
  );

  await prisma.raceResult.update({
    where: { id: resultId },
    data: {
      rawPointsAwarded: raw,
      // participationPointsAwarded is set by recomputeRoundScoring (per-round)
    },
  });
}

/**
 * Award participation per (round, registration) — once per round, not per race.
 * Sets participationPointsAwarded on the lowest-raceNumber result that earned
 * the participation; zeroes it on the others. This works correctly for both
 * single-race and multi-race rounds.
 */
async function recomputeParticipationForRound(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: true,
    },
  });
  if (!round) return;
  const scoring = round.season.scoringSystem;

  // Group results by registrationId
  const byReg = new Map<string, typeof round.raceResults>();
  for (const r of round.raceResults) {
    const list = byReg.get(r.registrationId) ?? [];
    list.push(r);
    byReg.set(r.registrationId, list);
  }

  for (const list of byReg.values()) {
    const earned = list.some(
      (r) =>
        r.finishStatus !== "DNS" &&
        r.raceDistancePct >= scoring.participationMinDistancePct
    );
    const sorted = [...list].sort((a, b) => a.raceNumber - b.raceNumber);
    for (let i = 0; i < sorted.length; i++) {
      const target =
        earned && i === 0 ? scoring.participationPoints : 0;
      if (sorted[i].participationPointsAwarded !== target) {
        await prisma.raceResult.update({
          where: { id: sorted[i].id },
          data: { participationPointsAwarded: target },
        });
      }
    }
  }
}

/**
 * Recompute Fair Play Rating awards for a round based on the scoring system.
 * Wipes existing awards and creates new ones.
 */
export async function recomputeRoundFPR(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: {
        include: {
          registration: {
            include: { team: true, carClass: true },
          },
        },
      },
    },
  });
  if (!round) return;

  await prisma.fPRAward.deleteMany({ where: { roundId } });

  const scoring = round.season.scoringSystem;
  if (!scoring.fprEnabled) return;

  const tiers = (scoring.fprTiers as FPRTier[] | null) ?? [];
  if (tiers.length === 0) return;
  const sortedTiers = [...tiers].sort((a, b) => a.max - b.max);

  type Bucket = { teamId: string; carClassId: string | null; incidents: number };
  const buckets = new Map<string, Bucket>();

  // Sum incidents by (team, class) — incidents accumulate across all races
  for (const r of round.raceResults) {
    const teamId = r.registration.teamId;
    if (!teamId) continue;
    const carClassId = round.season.isMulticlass
      ? r.registration.carClassId
      : null;
    const key = `${teamId}|${carClassId ?? ""}`;
    const cur = buckets.get(key);
    if (cur) cur.incidents += r.incidents;
    else buckets.set(key, { teamId, carClassId, incidents: r.incidents });
  }

  if (scoring.fprMode === "ALL_TEAMS_TIERED") {
    for (const b of buckets.values()) {
      const tier = sortedTiers.find((t) => b.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: b.teamId,
          carClassId: b.carClassId,
          teamIncidentTotal: b.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  } else if (scoring.fprMode === "LOWEST_TEAM_ONLY") {
    const byClass = new Map<string, Bucket[]>();
    for (const b of buckets.values()) {
      const k = b.carClassId ?? "";
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(b);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => a.incidents - b.incidents);
      const winner = list[0];
      const tier = sortedTiers.find((t) => winner.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: winner.teamId,
          carClassId: winner.carClassId,
          teamIncidentTotal: winner.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  }
}

/**
 * Recompute everything for a round: per-result raw points + per-round
 * participation + FPR.
 */
export async function recomputeRoundScoring(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const results = await prisma.raceResult.findMany({
    where: { roundId },
    select: { id: true },
  });
  for (const r of results) {
    await recomputeResultPoints(prisma, r.id);
  }
  await recomputeParticipationForRound(prisma, roundId);
  await recomputeRoundFPR(prisma, roundId);
}
EOF
echo "Wrote src/lib/scoring.ts (multi-race aware)."

# ---------------------------------------------------------------
# 2) Update irlm-import.ts: map sessions to raceNumber, skip "Combined"
# ---------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/irlm-import.ts";
let s = fs.readFileSync(FILE, "utf8");

// Replace isRaceSession with a more nuanced session classifier inside the loop.
// We anchor on the existing isRaceSession call and add a session-name -> raceNumber
// mapping right after the qualif/practice/warmup filter.
const before =
  "      if (!isRaceSession(session.sessionType ?? session.sessionName)) {\n        continue;\n      }";
const after =
  '      const sessionLabel = String(\n' +
  '        session.sessionName ?? session.sessionType ?? ""\n' +
  '      ).toLowerCase();\n' +
  '      if (\n' +
  '        sessionLabel.includes("qualif") ||\n' +
  '        sessionLabel.includes("practice") ||\n' +
  '        sessionLabel.includes("warmup")\n' +
  '      ) {\n' +
  '        continue;\n' +
  '      }\n' +
  '      // Skip iRLM\'s own combined view — we compute combined ourselves.\n' +
  '      if (sessionLabel.includes("combined")) continue;\n' +
  '      // Map "Race 1"/"Race 2"/etc to a raceNumber. Single-race rounds\n' +
  '      // (sessionName="Race") fall through to raceNumber=1.\n' +
  '      let raceNumber = 1;\n' +
  '      const raceMatch = sessionLabel.match(/race\\s*(\\d+)/);\n' +
  '      if (raceMatch) raceNumber = parseInt(raceMatch[1], 10);';
if (s.includes("const raceMatch = sessionLabel.match")) {
  console.log("importer: race-number mapping already present.");
} else {
  if (!s.includes(before)) { console.error("importer anchor not found"); process.exit(1); }
  s = s.replace(before, after);
  console.log("importer: inserted session-name -> raceNumber mapping.");
}

// Now wire the new raceNumber through importRow. The current call probably
// passes (seasonId, roundId, row, maxLaps, memberMap). We need to add raceNumber.
const callBefore =
  "        const result = await importRow(\n" +
  "          seasonId,\n" +
  "          roundId,\n" +
  "          row,\n" +
  "          maxLaps,\n" +
  "          memberMap\n" +
  "        );";
const callAfter =
  "        const result = await importRow(\n" +
  "          seasonId,\n" +
  "          roundId,\n" +
  "          row,\n" +
  "          maxLaps,\n" +
  "          memberMap,\n" +
  "          raceNumber\n" +
  "        );";
if (!s.includes("memberMap,\n          raceNumber\n        );")) {
  if (!s.includes(callBefore)) { console.error("importer call anchor not found"); process.exit(1); }
  s = s.replace(callBefore, callAfter);
  console.log("importer: passed raceNumber to importRow.");
}

// Update importRow signature + upsert key to include raceNumber.
const sigBefore =
  "async function importRow(\n  seasonId: string,\n  roundId: string,\n  row: IRLMResultRow,\n  maxLaps: number,\n  memberMap: Map<number, string>\n): Promise<{ ok: boolean; reason?: string }> {";
const sigAfter =
  "async function importRow(\n  seasonId: string,\n  roundId: string,\n  row: IRLMResultRow,\n  maxLaps: number,\n  memberMap: Map<number, string>,\n  raceNumber: number\n): Promise<{ ok: boolean; reason?: string }> {";
if (!s.includes("memberMap: Map<number, string>,\n  raceNumber: number")) {
  if (!s.includes(sigBefore)) { console.error("importRow signature anchor not found"); process.exit(1); }
  s = s.replace(sigBefore, sigAfter);
  console.log("importer: extended importRow signature.");
}

// Update upsert key inside importRow: { roundId, registrationId: reg.id, raceNumber: 1 } -> raceNumber
const keyBefore =
  "where: { roundId_registrationId_raceNumber: { roundId, registrationId: reg.id, raceNumber: 1 } },";
const keyAfter =
  "where: { roundId_registrationId_raceNumber: { roundId, registrationId: reg.id, raceNumber } },";
if (s.includes(keyAfter)) {
  console.log("importer: upsert key already dynamic.");
} else {
  if (!s.includes(keyBefore)) { console.error("importRow upsert key anchor not found"); process.exit(1); }
  s = s.replace(keyBefore, keyAfter);
  console.log("importer: upsert key now uses dynamic raceNumber.");
}

// Make sure raceNumber is in create payload
const createBefore =
  "    create: {\n      roundId,\n      registrationId: reg.id,\n      finishStatus,";
const createAfter =
  "    create: {\n      roundId,\n      registrationId: reg.id,\n      raceNumber,\n      finishStatus,";
if (s.includes("registrationId: reg.id,\n      raceNumber,\n      finishStatus")) {
  console.log("importer: create payload already includes raceNumber.");
} else {
  if (!s.includes(createBefore)) { console.error("importer create payload anchor not found"); process.exit(1); }
  s = s.replace(createBefore, createAfter);
  console.log("importer: create payload includes raceNumber.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-importer.mjs

# ---------------------------------------------------------------
# 3) Update standings.ts: aggregate raceResults per round
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings-multi.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// Change resultsByRoundId from Map<string, RaceResult> to Map<string, RaceResult[]>
// and update the rounds.map callback to aggregate across all races.
const before =
`    const resultsByRoundId = new Map(
      reg.raceResults.map((r) => [r.roundId, r])
    );
    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const result = resultsByRoundId.get(round.id);
      if (!result) {`;

const afterPrefix =
`    const resultsByRoundId = new Map<string, typeof reg.raceResults>();
    for (const r of reg.raceResults) {
      const list = resultsByRoundId.get(r.roundId) ?? [];
      list.push(r);
      resultsByRoundId.set(r.roundId, list);
    }
    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const results = resultsByRoundId.get(round.id) ?? [];
      if (results.length === 0) {`;

if (s.includes("typeof reg.raceResults>();\n    for (const r of reg.raceResults)")) {
  console.log("standings: per-round aggregation already in place.");
} else {
  if (!s.includes(before)) { console.error("standings aggregation anchor #1 missing"); process.exit(1); }
  s = s.replace(before, afterPrefix);
  console.log("standings: switched resultsByRoundId to a list and renamed result -> results.");
}

// Now change the body that reads `result.X` to aggregate across `results`.
// Anchor the with-result branch: we look for `const rRaw = result.rawPointsAwarded;`
const bodyBefore =
`      const rRaw = result.rawPointsAwarded;
      const rPart = result.participationPointsAwarded;
      const rPen = result.manualPenaltyPoints;
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        const classPos = classPositionByResult.get(result.id);
        if (classPos != null) {
          rClassRaw = pointsTable[String(classPos)] ?? 0;
        }
      }`;

const bodyAfter =
`      const rRaw = results.reduce((sum, r) => sum + r.rawPointsAwarded, 0);
      const rPart = results.reduce(
        (sum, r) => sum + r.participationPointsAwarded,
        0
      );
      const rPen = results.reduce(
        (sum, r) => sum + r.manualPenaltyPoints,
        0
      );
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        rClassRaw = 0;
        for (const r of results) {
          const classPos = classPositionByResult.get(r.id);
          if (classPos != null) {
            rClassRaw += pointsTable[String(classPos)] ?? 0;
          } else {
            rClassRaw += r.rawPointsAwarded;
          }
        }
      }`;

if (s.includes("results.reduce((sum, r) => sum + r.rawPointsAwarded")) {
  console.log("standings: roundPoints body already aggregates.");
} else {
  if (!s.includes(bodyBefore)) { console.error("standings body anchor missing"); process.exit(1); }
  s = s.replace(bodyBefore, bodyAfter);
  console.log("standings: roundPoints body aggregates across races per round.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings-multi.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 4) Recompute scoring across all rounds (cleans up any old participation
#    duplication; SFL stays as-is until the user re-pulls)
# ---------------------------------------------------------------
echo ""
echo "=== Recompute scoring across all rounds ==="
mkdir -p scripts
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

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Phase 3 multirace: scoring engine, iRLM importer, standings aggregation"
git push

echo ""
echo "Done. After Vercel:"
echo "  - GT3 / GT4 / IEC behaviour unchanged (single race per round)."
echo "  - SFL S7 still shows old combined-as-race-1 data until you re-pull."
echo ""
echo "NEXT for SFL:"
echo "  Open each completed SFL S7 round (R1..R5) in admin and click 'Pull from iRLM'."
echo "  After each pull, that round will have TWO RaceResult rows per driver"
echo "  (race 1 + race 2), points computed via the two tables, and participation"
echo "  awarded once. Standings update automatically."
echo ""
echo "Phase 4 (still to come): a round-page UI that shows Race 1 / Race 2 side"
echo "by side instead of just a single combined table."
