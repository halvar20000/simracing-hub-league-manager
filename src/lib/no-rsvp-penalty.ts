/**
 * Apply / clear the "no-show" penalty for a round.
 *
 * Gating: driven by ScoringSystem.penaltyPoolMode (was previously hard-gated
 * to league slug = "cas-gt3-wct"). The helper runs when the mode is FULL
 * (GT3 WCT — penalty feeds the auto-forgiveness pool) or NO_SHOW_ONLY (SFL —
 * penalty appears in a no-show-only pool view; no auto-forgiveness). When
 * the mode is OFF no penalty is applied.
 *
 * Rule (when active) — TWO categories of no-show are penalised, both with
 * source = NO_RSVP_NO_SHOW and pointsValue = ScoringSystem.noRsvpNoShowPenaltyPoints:
 *
 *   1. Confirmed grid, no RSVP: every *confirmed grid* Registration in the
 *      season that has NO RaceResult for the round AND NO RoundRsvp row at all
 *      gets the penalty. Accept, Decline, Tentative are all exempt — only true
 *      silence + no-show.
 *      "Confirmed grid" means: status = APPROVED, not excluded, not retired,
 *      not a non-driving team manager, and NOT on the waiting list
 *      (waitlistedAt = null). A driver who is still PENDING or waitlisted was
 *      never expected to race (and often can't even RSVP yet), so they are NOT
 *      caught by this rule.
 *
 *   2. Accepted fill-in, no-show: a waiting-list driver who was offered this
 *      round's one-race fill-in slot and clicked *Accept*
 *      (RoundFillIn.acceptedAt set) but has NO RaceResult and did NOT decline.
 *      Accepting a fill-in commits the driver to that specific race — they took
 *      a slot that would otherwise have gone to the next driver on the list —
 *      so ghosting it is penalised just like a confirmed-grid no-show. A fill-in
 *      who was merely offered but never accepted (acceptedAt = null), or who
 *      declined the offer, is exempt (declining removes the fill-in row and
 *      records a DECLINED RSVP). This is the only rule that penalises a
 *      waitlisted driver.
 *
 *   - GT3 WCT Round 1 ONLY: the *confirmed-grid* rule additionally requires
 *     eligibleRound1 = true. A driver the admin has not yet cleared for the
 *     season-opener slot ("Startberechtigt") is exempt at R1. From R2 onward
 *     the flag is ignored. (Fill-ins are only ever offered R1 when they're
 *     already eligible, so no extra R1 gate is needed for rule 2.)
 *
 * Idempotent: re-running on an already-processed round does nothing new.
 *
 * If a round is later moved out of COMPLETED, the helper clears the
 * auto-created NO_RSVP_NO_SHOW penalties so they don't sit stale.
 *
 * After mutating penalties, the caller is responsible for invoking
 * recomputePenaltyPoolForSeason — that helper is itself a no-op in modes
 * other than FULL, so it's safe to call unconditionally.
 */

import { prisma } from "@/lib/prisma";

export type NoRsvpPenaltyResult = {
  league: string;
  mode: string;
  applied: number;
  cleared: number;
};

export async function applyNoRsvpNoShowPenalties(
  roundId: string
): Promise<NoRsvpPenaltyResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: { select: { slug: true } },
          scoringSystem: {
            select: {
              penaltyPoolMode: true,
              noRsvpNoShowPenaltyPoints: true,
            },
          },
          registrations: {
            // Only confirmed grid drivers can incur a no-show penalty:
            // approved, not excluded, not a non-driving team manager, and not
            // on the waiting list. Pending / waitlisted drivers were never
            // expected to race (and often can't RSVP yet), so they're exempt
            // from rule 1 — a waitlisted fill-in is caught by rule 2 below.
            where: {
              excludedAt: null,
              retiredAt: null,
              status: "APPROVED",
              isTeamManager: false,
              waitlistedAt: null,
            },
            select: { id: true, eligibleRound1: true },
          },
        },
      },
      raceResults: { select: { registrationId: true } },
      rsvps: { select: { registrationId: true, status: true } },
      // Rule 2 candidates: fill-in offers this round that the driver ACCEPTED
      // (acceptedAt set), for a still-valid registration. Waitlisted status is
      // expected here (fill-ins are waitlisted), so it's deliberately not filtered.
      fillIns: {
        where: {
          acceptedAt: { not: null },
          registration: {
            excludedAt: null,
            retiredAt: null,
            status: "APPROVED",
            isTeamManager: false,
          },
        },
        select: { registrationId: true },
      },
    },
  });
  if (!round) {
    return { league: "(missing)", mode: "(none)", applied: 0, cleared: 0 };
  }

  const slug = round.season.league.slug;
  const mode = round.season.scoringSystem.penaltyPoolMode;
  if (mode === "OFF") {
    return { league: slug, mode, applied: 0, cleared: 0 };
  }

  // Only run when the round is actually COMPLETED. If it's not, treat as
  // "clear stale auto-penalties" (in case the admin un-completed the round).
  if (round.status !== "COMPLETED") {
    const cleared = await prisma.penalty.deleteMany({
      where: { roundId, source: "NO_RSVP_NO_SHOW" },
    });
    return { league: slug, mode, applied: 0, cleared: cleared.count };
  }

  const ranRegIds = new Set(round.raceResults.map((r) => r.registrationId));
  const rsvpRegIds = new Set(round.rsvps.map((r) => r.registrationId));
  const declinedRegIds = new Set(
    round.rsvps
      .filter((r) => r.status === "DECLINED")
      .map((r) => r.registrationId)
  );

  // GT3 WCT only, and ONLY for Round 1: a driver not yet cleared for the
  // season-opener slot (eligibleRound1 = false) is exempt from the R1 no-show
  // penalty. The flag exists solely to protect brand-new, uncleared drivers at
  // R1 — it does NOT carry over: from R2 onward a confirmed grid driver is a
  // full participant and is subject to the no-show penalty like everyone else.
  // The flag defaults to false and is "ignored for other leagues", so we must
  // NOT apply it outside GT3 WCT (or beyond R1) or it would exempt everyone.
  const requireEligible = slug === "cas-gt3-wct" && round.roundNumber === 1;

  // Rule 1 — confirmed grid, no RaceResult, no RSVP row at all.
  const silentNoShows = round.season.registrations.filter(
    (reg) =>
      !ranRegIds.has(reg.id) &&
      !rsvpRegIds.has(reg.id) &&
      (!requireEligible || reg.eligibleRound1)
  );

  // Rule 2 — accepted fill-in, no RaceResult, did not decline.
  const acceptedFillInNoShows = round.fillIns.filter(
    (f) =>
      !ranRegIds.has(f.registrationId) &&
      !declinedRegIds.has(f.registrationId)
  );

  // Merge both categories, registrationId -> penalty reason. Rule 1 wins on the
  // (practically impossible) overlap — a driver can't be both confirmed grid
  // and a waitlisted fill-in at once.
  const targets = new Map<string, string>();
  for (const reg of silentNoShows) targets.set(reg.id, "No RSVP and no-show");
  for (const f of acceptedFillInNoShows) {
    if (!targets.has(f.registrationId)) {
      targets.set(f.registrationId, "Accepted fill-in and no-show");
    }
  }

  // Idempotency: skip drivers who already have an auto-penalty for this round.
  const existing = await prisma.penalty.findMany({
    where: { roundId, source: "NO_RSVP_NO_SHOW" },
    select: { registrationId: true },
  });
  const alreadyPenalized = new Set(existing.map((e) => e.registrationId));

  const toCreate = [...targets.entries()].filter(
    ([registrationId]) => !alreadyPenalized.has(registrationId)
  );

  if (toCreate.length === 0) {
    return { league: slug, mode, applied: 0, cleared: 0 };
  }

  const points = round.season.scoringSystem.noRsvpNoShowPenaltyPoints;

  await prisma.penalty.createMany({
    data: toCreate.map(([registrationId, reason]) => ({
      registrationId,
      roundId,
      source: "NO_RSVP_NO_SHOW" as const,
      type: "POINTS_DEDUCTION" as const,
      pointsValue: points,
      reason,
    })),
  });

  return { league: slug, mode, applied: toCreate.length, cleared: 0 };
}
