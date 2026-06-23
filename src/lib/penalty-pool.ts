import { prisma } from "@/lib/prisma";

/**
 * Penalty Pool — auto-forgiveness engine.
 *
 * Gating: ScoringSystem.penaltyPoolMode must be FULL for this engine to run.
 * Other modes are no-ops:
 *   - OFF          → no pool at all
 *   - NO_SHOW_ONLY → SFL Cup style: NO_RSVP_NO_SHOW penalties appear in a
 *                    pool view but no forgiveness is applied; nothing to
 *                    recompute, so we return early.
 *
 * Rule (when FULL):
 *   - Penalty points from each finalized IncidentDecision go into the driver's pool.
 *   - For every 2 COMPLETED rounds the driver entered WITHOUT new penalty points,
 *     1 point is forgiven from the oldest non-fully-forgiven penalty.
 *   - Only clean races AFTER the driver's first penalty count toward forgiveness.
 *     Clean races earlier in the season do not pre-credit a later penalty.
 *   - A new penalty point arriving mid-cycle resets the clean-race counter to 0.
 *   - Forgiveness stops when the effective pool reaches 0.
 *
 * Effective pool point per penalty = pointsValue - forgivenPoints - autoForgivenPoints
 * Effective season pool = sum of effective points over all non-released penalties.
 *
 * NO_RSVP_NO_SHOW penalties are EXCLUDED from this engine entirely:
 *   - They are never auto-forgiven (their autoForgivenPoints stays at 0).
 *   - They do not contribute to the "remaining pool" gate that triggers
 *     forgiveness cycles.
 *   - They do not reset the clean-race counter (not showing up is not a
 *     racing incident).
 * They sit permanently as their own kind of demerit. Clean races forgive
 * incident-decision penalties only.
 *
 * The engine OWNS autoForgivenPoints. It resets it for every penalty in the
 * season's registrations before recomputing, so it is idempotent and free of
 * drift. Manual forgiveness (admin) lives in forgivenPoints and is untouched.
 */

export async function recomputePenaltyPoolForSeason(seasonId: string): Promise<{
  ran: boolean;
  reason?: string;
  registrationsProcessed: number;
  pointsForgiven: number;
}> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: { select: { slug: true } },
      scoringSystem: { select: { penaltyPoolMode: true } },
    },
  });
  if (!season) return { ran: false, reason: "season not found", registrationsProcessed: 0, pointsForgiven: 0 };
  if (season.scoringSystem.penaltyPoolMode !== "FULL") {
    return {
      ran: false,
      reason: `penaltyPoolMode=${season.scoringSystem.penaltyPoolMode} — auto-forgiveness only runs in FULL mode`,
      registrationsProcessed: 0,
      pointsForgiven: 0,
    };
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

  // 2. Load all penalties + race-result entries in one shot.
  //    NO_RSVP_NO_SHOW penalties are excluded — they never participate in the
  //    auto-forgiveness loop (they're a separate, permanent demerit).
  const allPenalties = await prisma.penalty.findMany({
    where: {
      registrationId: { in: regIds },
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      pointsValue: { gt: 0 },
      source: { not: "NO_RSVP_NO_SHOW" },
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

  // "Entered and raced cleanly" for the forgiveness counter means CLASSIFIED
  // or DNF only. DSQ does NOT count toward forgiveness (a disqualified race is
  // not a clean race), and DNS / no-result obviously don't either. The penalty
  // pool table still shows a DSQ marker, but it neither advances nor resets the
  // forgiveness counter (unless a penalty was also issued that round, which is
  // tracked separately via the penalty rounds).
  const allResults = await prisma.raceResult.findMany({
    where: {
      roundId: { in: completedRounds.map((r) => r.id) },
      registrationId: { in: regIds },
      finishStatus: { in: ["CLASSIFIED", "DNF"] },
    },
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
    // A NO_RSVP_NO_SHOW penalty lives on a round the driver did NOT enter,
    // so we must also walk any round where the driver carries a penalty —
    // otherwise the "new penalty resets the clean counter" rule misses it.
    const penaltyRoundIds = new Set(
      myPenalties.map((p) => p.roundId)
    );
    let cleanCounter = 0;
    // Only clean races AFTER the driver's first penalty count toward
    // forgiveness. Clean races earlier in the season are not "credit" toward
    // a future penalty's forgiveness.
    let hasIncurredAnyPenaltyYet = false;

    for (const round of completedRounds) {
      const didEnter = enteredRoundIds.has(round.id);
      const hasPenaltyThisRound = penaltyRoundIds.has(round.id);
      if (!didEnter && !hasPenaltyThisRound) continue;

      const incurredThisRound = myPenalties.some((p) => p.roundId === round.id);
      if (incurredThisRound) {
        hasIncurredAnyPenaltyYet = true;
        cleanCounter = 0;
        continue;
      }

      // Pre-penalty clean races don't pre-credit forgiveness.
      if (!hasIncurredAnyPenaltyYet) continue;

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
