#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# Schema is already patched (autoForgivenPoints added in the previous run).
# We just need to push to Neon, generate the client, and add the lib files.

echo "=== 1. Verify schema patch is in place ==="
grep -nE 'autoForgivenPoints' prisma/schema.prisma || {
  echo "!!! autoForgivenPoints not in schema. Re-run penalty-pool-phase1.sh first."
  exit 1
}

# ============================================================================
# 2. prisma db push — sync schema to Neon without migration files
#    Safe here because the change is purely additive (new INT column with default 0).
#    NO --accept-data-loss flag; if Prisma flags data loss, abort.
# ============================================================================
echo ""
echo "=== 2. prisma db push (additive only, no --accept-data-loss) ==="
npx --yes prisma db push --skip-generate || {
  echo "!!! prisma db push failed. NOT pushing to git."
  exit 1
}

echo ""
echo "=== 3. prisma generate ==="
npx --yes prisma generate || {
  echo "!!! prisma generate failed."
  exit 1
}

# ============================================================================
# 4. Write engine
# ============================================================================
echo ""
echo "=== 4. Write src/lib/penalty-pool.ts ==="
mkdir -p src/lib
cat > src/lib/penalty-pool.ts <<'TS'
import { prisma } from "@/lib/prisma";

/**
 * Penalty Pool — auto-forgiveness engine for CAS GT3 WCT.
 *
 * Rule (per registration, per season):
 *   - Penalty points from each finalized IncidentDecision go into the driver's pool.
 *   - For every 2 COMPLETED rounds the driver entered WITHOUT new penalty points,
 *     1 point is forgiven from the oldest non-fully-forgiven penalty.
 *   - A new penalty point arriving mid-cycle resets the clean-race counter to 0.
 *   - Forgiveness stops when the effective pool reaches 0.
 *
 * Effective pool point per penalty = pointsValue - forgivenPoints - autoForgivenPoints
 * Effective season pool = sum of effective points over all non-released penalties.
 *
 * The engine OWNS autoForgivenPoints. It resets it for every penalty in the
 * season's registrations before recomputing, so it is idempotent and free of
 * drift. Manual forgiveness (admin) lives in forgivenPoints and is untouched.
 */

const GT3_WCT_SLUG = "cas-gt3-wct";

export async function recomputePenaltyPoolForSeason(seasonId: string): Promise<{
  ran: boolean;
  reason?: string;
  registrationsProcessed: number;
  pointsForgiven: number;
}> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: { select: { slug: true } } },
  });
  if (!season) return { ran: false, reason: "season not found", registrationsProcessed: 0, pointsForgiven: 0 };
  if (season.league.slug !== GT3_WCT_SLUG) {
    return { ran: false, reason: `not GT3 WCT (slug=${season.league.slug})`, registrationsProcessed: 0, pointsForgiven: 0 };
  }

  const rounds = await prisma.round.findMany({
    where: { seasonId },
    orderBy: { roundNumber: "asc" },
    select: { id: true, status: true, roundNumber: true },
  });
  const completedRounds = rounds.filter((r) => r.status === "COMPLETED");

  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    select: { id: true },
  });
  if (registrations.length === 0) {
    return { ran: true, registrationsProcessed: 0, pointsForgiven: 0 };
  }
  const regIds = registrations.map((r) => r.id);

  // 1. Reset autoForgivenPoints for every penalty owned by these registrations
  await prisma.penalty.updateMany({
    where: { registrationId: { in: regIds } },
    data: { autoForgivenPoints: 0 },
  });

  // 2. Load all penalties + race-result entries in one shot
  const allPenalties = await prisma.penalty.findMany({
    where: {
      registrationId: { in: regIds },
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      pointsValue: { gt: 0 },
    },
    select: {
      id: true,
      registrationId: true,
      roundId: true,
      pointsValue: true,
      forgivenPoints: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const allResults = await prisma.raceResult.findMany({
    where: { roundId: { in: completedRounds.map((r) => r.id) }, registrationId: { in: regIds } },
    select: { roundId: true, registrationId: true },
  });
  const enteredByReg = new Map<string, Set<string>>();
  for (const rr of allResults) {
    let s = enteredByReg.get(rr.registrationId);
    if (!s) { s = new Set(); enteredByReg.set(rr.registrationId, s); }
    s.add(rr.roundId);
  }

  // 3. Per-registration state machine
  type Allocation = { penaltyId: string; amount: number };
  const allocations: Allocation[] = [];

  for (const reg of registrations) {
    const myPenalties = allPenalties
      .filter((p) => p.registrationId === reg.id)
      .map((p) => ({
        id: p.id,
        roundId: p.roundId,
        pointsValue: p.pointsValue ?? 0,
        manualForgiven: p.forgivenPoints,
        autoForgiven: 0,
      }));

    if (myPenalties.length === 0) continue;

    const enteredRoundIds = enteredByReg.get(reg.id) ?? new Set<string>();
    let cleanCounter = 0;

    for (const round of completedRounds) {
      if (!enteredRoundIds.has(round.id)) continue;

      const incurredThisRound = myPenalties.some((p) => p.roundId === round.id);
      if (incurredThisRound) {
        cleanCounter = 0;
        continue;
      }

      const remainingPool = myPenalties.reduce(
        (sum, p) => sum + Math.max(0, p.pointsValue - p.manualForgiven - p.autoForgiven),
        0
      );
      if (remainingPool <= 0) continue;

      cleanCounter += 1;
      if (cleanCounter >= 2) {
        const oldest = myPenalties.find(
          (p) => p.pointsValue - p.manualForgiven - p.autoForgiven > 0
        );
        if (oldest) {
          oldest.autoForgiven += 1;
        }
        cleanCounter = 0;
      }
    }

    for (const p of myPenalties) {
      if (p.autoForgiven > 0) {
        allocations.push({ penaltyId: p.id, amount: p.autoForgiven });
      }
    }
  }

  // 4. Apply allocations
  for (const alloc of allocations) {
    await prisma.penalty.update({
      where: { id: alloc.penaltyId },
      data: { autoForgivenPoints: alloc.amount },
    });
  }

  const pointsForgiven = allocations.reduce((s, a) => s + a.amount, 0);
  return { ran: true, registrationsProcessed: registrations.length, pointsForgiven };
}

/**
 * Convenience: pool summary per registration in a season (for UI).
 */
export async function getPenaltyPoolForSeason(seasonId: string) {
  const penalties = await prisma.penalty.findMany({
    where: {
      registration: { seasonId },
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      pointsValue: { gt: 0 },
    },
    select: {
      id: true,
      registrationId: true,
      roundId: true,
      pointsValue: true,
      forgivenPoints: true,
      autoForgivenPoints: true,
      createdAt: true,
      reason: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byReg = new Map<string, {
    activePool: number;
    incurred: number;
    autoForgiven: number;
    manualForgiven: number;
    entries: typeof penalties;
  }>();

  for (const p of penalties) {
    const r = byReg.get(p.registrationId) ?? {
      activePool: 0,
      incurred: 0,
      autoForgiven: 0,
      manualForgiven: 0,
      entries: [] as typeof penalties,
    };
    const pv = p.pointsValue ?? 0;
    const effective = Math.max(0, pv - p.forgivenPoints - p.autoForgivenPoints);
    r.activePool += effective;
    r.incurred += pv;
    r.autoForgiven += p.autoForgivenPoints;
    r.manualForgiven += p.forgivenPoints;
    r.entries.push(p);
    byReg.set(p.registrationId, r);
  }

  return byReg;
}
TS
echo "  Wrote src/lib/penalty-pool.ts"

# ============================================================================
# 5. Server action wrapper
# ============================================================================
echo ""
echo "=== 5. Write src/lib/actions/penalty-pool.ts ==="
mkdir -p src/lib/actions
cat > src/lib/actions/penalty-pool.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

export async function recomputePenaltyPoolAction(formData: FormData) {
  const seasonId = formData.get("seasonId");
  const leagueSlug = formData.get("leagueSlug");
  if (typeof seasonId !== "string" || !seasonId) throw new Error("seasonId required");
  const result = await recomputePenaltyPoolForSeason(seasonId);
  if (typeof leagueSlug === "string" && leagueSlug) {
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  }
  return result;
}
TS
echo "  Wrote src/lib/actions/penalty-pool.ts"

# ============================================================================
# 6. tsc
# ============================================================================
echo ""
echo "=== 6. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 7. Commit + push
# ============================================================================
echo ""
echo "=== 7. Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool (Phase 1, GT3 WCT): Penalty.autoForgivenPoints (db push) + recomputePenaltyPoolForSeason engine + server action. No UI/auto-triggers yet."
git push

echo ""
echo "Done."
