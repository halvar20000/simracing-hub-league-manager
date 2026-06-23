/**
 * Apply / clear the "no RSVP and no-show" penalty for a round.
 *
 * Gating: driven by ScoringSystem.penaltyPoolMode (was previously hard-gated
 * to league slug = "cas-gt3-wct"). The helper runs when the mode is FULL
 * (GT3 WCT — penalty feeds the auto-forgiveness pool) or NO_SHOW_ONLY (SFL —
 * penalty appears in a no-show-only pool view; no auto-forgiveness). When
 * the mode is OFF no penalty is applied.
 *
 * Rule (when active):
 *   - When a round flips to COMPLETED, every *confirmed grid* Registration in
 *     the season that has NO RaceResult for the round AND NO RoundRsvp row at
 *     all gets a POINTS_DEDUCTION penalty (source = NO_RSVP_NO_SHOW), with
 *     pointsValue = ScoringSystem.noRsvpNoShowPenaltyPoints.
 *   - Accept, Decline, Tentative are all exempt — only true silence + no-show.
 *   - "Confirmed grid" means: status = APPROVED, not excluded, not a non-driving
 *     team manager, and not on the waiting list (waitlistedAt = null). A driver
 *     who is still PENDING (not yet approved) or waitlisted was never expected
 *     to race, so they are NOT penalised — they often can't even RSVP yet.
 *   - GT3 WCT only: additionally requires eligibleRound1 = true. A driver the
 *     admin has not yet cleared to take a slot ("Startberechtigt") is exempt.
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
            // expected to race (and often can't RSVP yet), so they're exempt.
            where: {
              excludedAt: null,
              status: "APPROVED",
              isTeamManager: false,
              waitlistedAt: null,
            },
            select: { id: true, eligibleRound1: true },
          },
        },
      },
      raceResults: { select: { registrationId: true } },
      rsvps: { select: { registrationId: true } },
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

  // GT3 WCT only: a driver not yet cleared for a slot (eligibleRound1 = false)
  // is exempt. The flag defaults to false and is "ignored for other leagues",
  // so we must NOT apply it outside GT3 WCT or it would exempt everyone.
  const requireEligible = slug === "cas-gt3-wct";

  const silentNoShows = round.season.registrations.filter(
    (reg) =>
      !ranRegIds.has(reg.id) &&
      !rsvpRegIds.has(reg.id) &&
      (!requireEligible || reg.eligibleRound1)
  );

  // Idempotency: skip drivers who already have an auto-penalty for this round.
  const existing = await prisma.penalty.findMany({
    where: { roundId, source: "NO_RSVP_NO_SHOW" },
    select: { registrationId: true },
  });
  const alreadyPenalized = new Set(existing.map((e) => e.registrationId));

  const toCreate = silentNoShows.filter((reg) => !alreadyPenalized.has(reg.id));

  if (toCreate.length === 0) {
    return { league: slug, mode, applied: 0, cleared: 0 };
  }

  const points = round.season.scoringSystem.noRsvpNoShowPenaltyPoints;

  await prisma.penalty.createMany({
    data: toCreate.map((reg) => ({
      registrationId: reg.id,
      roundId,
      source: "NO_RSVP_NO_SHOW" as const,
      type: "POINTS_DEDUCTION" as const,
      pointsValue: points,
      reason: "No RSVP and no-show",
    })),
  });

  return { league: slug, mode, applied: toCreate.length, cleared: 0 };
}
