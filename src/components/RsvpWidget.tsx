/**
 * Driver-facing RSVP widget for the public round page.
 *
 * Server component — renders three <form> elements that each submit a
 * different status via the same server action. The "selected" button is
 * highlighted; clicking another swaps the selection.
 *
 * Hidden entirely if the round is no longer UPCOMING (race already happened
 * or is in progress).
 */

import type { RsvpStatus } from "@prisma/client";
import { submitRsvpAction } from "@/lib/actions/rsvp";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

const STATUS_META: Record<
  RsvpStatus,
  { label: string; emoji: string; selectedClass: string; idleClass: string }
> = {
  ACCEPTED: {
    label: "Accept",
    emoji: "✅",
    selectedClass:
      "rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400",
    idleClass:
      "rounded border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/60",
  },
  DECLINED: {
    label: "Decline",
    emoji: "❌",
    selectedClass:
      "rounded bg-red-500 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-red-400",
    idleClass:
      "rounded border border-red-800 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900/60",
  },
  TENTATIVE: {
    label: "Tentative",
    emoji: "❔",
    selectedClass:
      "rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400",
    idleClass:
      "rounded border border-amber-800 bg-amber-950/40 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-900/60",
  },
};

export function RsvpWidget({
  roundId,
  roundStatus,
  currentStatus,
  isRegistered,
}: {
  roundId: string;
  roundStatus: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  currentStatus: RsvpStatus | null;
  isRegistered: boolean;
}) {
  if (roundStatus !== "UPCOMING") return null;

  if (!isRegistered) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Your RSVP
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          You&apos;re not registered for this season. Register first to RSVP for rounds.
        </p>
      </div>
    );
  }

  const statuses: RsvpStatus[] = ["ACCEPTED", "DECLINED", "TENTATIVE"];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Your RSVP
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Will you be on the grid? You can change your answer up until the race starts.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {statuses.map((s) => {
          const meta = STATUS_META[s];
          const selected = currentStatus === s;
          return (
            <form key={s} action={submitRsvpAction}>
              <input type="hidden" name="roundId" value={roundId} />
              <input type="hidden" name="status" value={s} />
              <SubmitWithSpinner
                label={`${meta.emoji} ${meta.label}`}
                pendingLabel={`${meta.emoji} ${meta.label}…`}
                className={selected ? meta.selectedClass : meta.idleClass}
              />
            </form>
          );
        })}
      </div>
      {currentStatus && (
        <p className="mt-3 text-xs text-zinc-500">
          Current response: <span className="font-medium text-zinc-300">{currentStatus}</span>.
          Drivers who don&apos;t respond AND don&apos;t show up may incur a penalty point in GT3 WCT.
        </p>
      )}
    </div>
  );
}
