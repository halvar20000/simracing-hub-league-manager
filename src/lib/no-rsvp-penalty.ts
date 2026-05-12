/**
 * Apply / clear the "no RSVP and no-show" penalty for a round.
 *
 * Rule (only for league slug = "cas-gt3-wct"):
 *   - When a round flips to COMPLETED, every Registration in the season
 *     that has NO RaceResult for the round AND NO RoundRsvp row at all
 *     gets a 1-point POINTS_DEDUCTION penalty (source = NO_RSVP_NO_SHOW).
 *   - Accept, Decline, Tentative are all exempt — only true silence + no-show.
 *
 * Idempotent: re-running on an already-processed round does nothing new.
 *
 * If a round is later moved out of COMPLETED, the helper clears the
 * auto-created NO_RSVP_NO_SHOW penalties so they don't sit stale.
 *
 * After mutating penalties, the caller is responsible for invoking
 * recomputePenaltyPoolForSeason — these new penalties feed the pool.
 */

import { prisma } from "@/lib/prisma";

export type NoRsvpPenaltyResult = {
  league: string;
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
          registrations: {
            where: { excludedAt: null },
            select: { id: true },
          },
        },
      },
      raceResults: { select: { registrationId: true } },
      rsvps: { select: { registrationId: true } },
    },
  });
  if (!round) return { league: "(missing)", applied: 0, cleared: 0 };

  const slug = round.season.league.slug;
  if (slug !== "cas-gt3-wct") {
    return { league: slug, applied: 0, cleared: 0 };
  }

  // Only run when the round is actually COMPLETED. If it's not, treat as
  // "clear stale auto-penalties" (in case the admin un-completed the round).
  if (round.status !== "COMPLETED") {
    const cleared = await prisma.penalty.deleteMany({
      where: { roundId, source: "NO_RSVP_NO_SHOW" },
    });
    return { league: slug, applied: 0, cleared: cleared.count };
  }

  const ranRegIds = new Set(round.raceResults.map((r) => r.registrationId));
  const rsvpRegIds = new Set(round.rsvps.map((r) => r.registrationId));

  const silentNoShows = round.season.registrations.filter(
    (reg) => !ranRegIds.has(reg.id) && !rsvpRegIds.has(reg.id)
  );

  // Idempotency: skip drivers who already have an auto-penalty for this round.
  const existing = await prisma.penalty.findMany({
    where: { roundId, source: "NO_RSVP_NO_SHOW" },
    select: { registrationId: true },
  });
  const alreadyPenalized = new Set(existing.map((e) => e.registrationId));

  const toCreate = silentNoShows.filter((reg) => !alreadyPenalized.has(reg.id));

  if (toCreate.length === 0) {
    return { league: slug, applied: 0, cleared: 0 };
  }

  await prisma.penalty.createMany({
    data: toCreate.map((reg) => ({
      registrationId: reg.id,
      roundId,
      source: "NO_RSVP_NO_SHOW" as const,
      type: "POINTS_DEDUCTION" as const,
      pointsValue: 1,
      reason: "No RSVP and no-show",
    })),
  });

  return { league: slug, applied: toCreate.length, cleared: 0 };
}
