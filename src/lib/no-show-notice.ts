/**
 * The one sentence that tells a driver what a no-show costs.
 *
 * It used to be typed out twice — once in the web RSVP widget, once in the
 * Discord embed footer — and the web copy ended "…incur a penalty point in
 * GT3 WCT" whatever league you were looking at. A Combined Cup driver was told
 * about a penalty in a series he was not racing, for a rule his own series
 * does not have.
 *
 * Two things were wrong and only one of them was the league name:
 *
 *   1. The rule is not GT3 WCT's. It is driven by
 *      `ScoringSystem.penaltyPoolMode` — FULL (the penalty feeds the
 *      auto-forgiveness pool) or NO_SHOW_ONLY (it stands on its own). When the
 *      mode is OFF there is no penalty at all, and saying otherwise is simply
 *      untrue.
 *   2. The number is `ScoringSystem.noRsvpNoShowPenaltyPoints`, not always one.
 *
 * Pure, so the web page and the Discord post can share it and cannot drift
 * apart again. Returns null when there is nothing to say — the caller renders
 * nothing rather than a hedge.
 */

import type { PenaltyPoolMode } from "@prisma/client";

export type NoShowRule = {
  penaltyPoolMode: PenaltyPoolMode;
  noRsvpNoShowPenaltyPoints: number;
};

/** True when a no-show in this season actually costs something. */
export function noShowIsPenalised(rule: NoShowRule | null | undefined): boolean {
  if (!rule) return false;
  return (
    rule.penaltyPoolMode !== "OFF" && (rule.noRsvpNoShowPenaltyPoints ?? 0) > 0
  );
}

const points = (n: number) => `${n} penalty point${n === 1 ? "" : "s"}`;

/**
 * For the FULL RSVP widget, where the driver has answered Accept / Decline /
 * Tentative and only silence is punished.
 *
 * `leagueName` is named explicitly because the round page shows one league at
 * a time and a driver reading it on a phone has no other way to tell which
 * rules apply to the race in front of them.
 */
export function noShowNoticeFull(
  rule: NoShowRule | null | undefined,
  leagueName: string
): string | null {
  if (!noShowIsPenalised(rule)) return null;
  return `Drivers who don't respond AND don't show up may incur ${points(
    rule!.noRsvpNoShowPenaltyPoints
  )} in ${leagueName}.`;
}

/** For DECLINE_ONLY, where silence means "I am racing" and a no-show is one. */
export function noShowNoticeDeclineOnly(
  rule: NoShowRule | null | undefined,
  leagueName: string
): string | null {
  if (!noShowIsPenalised(rule)) return null;
  return `No-shows without a decline incur ${points(
    rule!.noRsvpNoShowPenaltyPoints
  )} in ${leagueName}.`;
}

/**
 * For the Discord embed footer, which already carries the league in its title
 * — repeating it there would read as shouting.
 */
export function noShowNoticeFooter(
  rule: NoShowRule | null | undefined
): string | null {
  if (!noShowIsPenalised(rule)) return null;
  return `No-shows without a Decline incur ${points(
    rule!.noRsvpNoShowPenaltyPoints
  )}.`;
}
