/**
 * Shared presentational badge for a driver's eligibility to drive a round.
 * Used by the admin round RSVP page and the public Grid & Waiting List page so
 * the two stay visually in sync. Pure JSX — safe in Server Components.
 *
 * Eligibility is computed in src/lib/rsvp.ts:getRoundRsvpSummary:
 *   - "confirmed" — a confirmed grid driver (always eligible)
 *   - "fillin"    — a waiting-list driver promoted for this round (a confirmed
 *                   driver declined, freeing a seat)
 *   - "waitlist"  — on the waiting list, not (yet) promoted for this round
 *   - "pending"   — registration not yet approved
 */

export type RoundEligibility = "confirmed" | "fillin" | "waitlist" | "pending";

/** RSVP status → short coloured label. */
export const RSVP_STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "✅ Accepted",
  DECLINED: "❌ Declined",
  TENTATIVE: "❔ Tentative",
};

export function EligibleBadge({
  eligibility,
}: {
  eligibility: RoundEligibility;
}) {
  if (eligibility === "confirmed") {
    return (
      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-200">
        ✓ Yes
      </span>
    );
  }
  if (eligibility === "fillin") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-200">
          ✓ Yes
        </span>
        <span className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
          fill-in
        </span>
      </span>
    );
  }
  if (eligibility === "waitlist") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[11px] text-zinc-500">No</span>
        <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200/80">
          waiting list
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-zinc-500">No</span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
        pending
      </span>
    </span>
  );
}
