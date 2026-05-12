/**
 * Pure helpers for the RSVP close window.
 *
 * A round's RSVP is "closed" when:
 *   - The round is no longer UPCOMING (IN_PROGRESS / COMPLETED), OR
 *   - We are within `League.rsvpCloseBeforeHours` of the race start time
 *
 * When closed:
 *   - The Discord embed shows disabled buttons + "Registration closed"
 *   - The interactions endpoint rejects button clicks
 *   - The website widget hides its buttons
 */

import type { Round, League } from "@prisma/client";

export type RsvpWindowInput = {
  startsAt: Round["startsAt"];
  status: Round["status"];
  rsvpCloseBeforeHours: League["rsvpCloseBeforeHours"];
};

export function isRsvpClosed(
  round: RsvpWindowInput,
  now: Date = new Date()
): boolean {
  if (round.status !== "UPCOMING") return true;
  const closeAt = new Date(
    round.startsAt.getTime() - round.rsvpCloseBeforeHours * 3600 * 1000
  );
  return now >= closeAt;
}

/**
 * Returns the Date when the RSVP transitions to closed. Useful for cron
 * filters that don't want to recompute per-row.
 */
export function rsvpCloseAt(round: RsvpWindowInput): Date {
  return new Date(
    round.startsAt.getTime() - round.rsvpCloseBeforeHours * 3600 * 1000
  );
}
