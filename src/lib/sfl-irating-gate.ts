import { prisma } from "@/lib/prisma";

/**
 * SFL Cup driver-eligibility gate.
 *
 * SFL Cup is capped: only drivers at or below SFL_MAX_IRATING may register for
 * a season — with one exception. A driver who actually raced in the most
 * recent prior SFL Cup season is exempt and may register at any iRating.
 *
 * Hard-gated by league slug, mirroring the GT3 WCT slug shims. To change the
 * cap, edit SFL_MAX_IRATING here.
 */
export const SFL_CUP_SLUG = "cas-sfl-cup";
export const SFL_MAX_IRATING = 3000;

export type SflIRatingGate = {
  /** True when the season belongs to SFL Cup and the cap is in force. */
  applies: boolean;
  /** The iRating ceiling for non-exempt (new) drivers. */
  maxIRating: number;
  /** True when this user raced in the most recent prior SFL Cup season. */
  exempt: boolean;
};

type SeasonForGate = {
  id: string;
  leagueId: string;
  year: number;
  createdAt: Date;
  league: { slug: string };
};

/**
 * Resolve the iRating gate for a given user registering for a given season.
 * Pure read-only — safe to call from both server components and server actions.
 */
export async function getSflIRatingGate(
  season: SeasonForGate,
  userId: string
): Promise<SflIRatingGate> {
  if (season.league.slug !== SFL_CUP_SLUG) {
    return { applies: false, maxIRating: SFL_MAX_IRATING, exempt: false };
  }

  // The most recent SFL Cup season strictly before this one. "Before" is
  // ordered by year, then createdAt as a tie-break (two seasons in one year).
  const prevSeason = await prisma.season.findFirst({
    where: {
      leagueId: season.leagueId,
      id: { not: season.id },
      OR: [
        { year: { lt: season.year } },
        { year: season.year, createdAt: { lt: season.createdAt } },
      ],
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  // No prior season => nobody is exempt; the cap applies to everyone.
  if (!prevSeason) {
    return { applies: true, maxIRating: SFL_MAX_IRATING, exempt: false };
  }

  // "Actually raced" = has a race result in that season that is not a
  // did-not-start. DNF and DSQ still count — the driver was on track.
  const racedBefore = await prisma.raceResult.findFirst({
    where: {
      finishStatus: { not: "DNS" },
      registration: { seasonId: prevSeason.id, userId },
    },
    select: { id: true },
  });

  return {
    applies: true,
    maxIRating: SFL_MAX_IRATING,
    exempt: !!racedBefore,
  };
}
