"use client";

import { useTransition } from "react";
import { adminSetRsvpAction } from "@/lib/actions/rsvp";

/**
 * Per-driver RSVP override buttons for the admin round RSVP page.
 *
 * Accept / Decline / Tentative upsert the driver's RoundRsvp row (source
 * ADMIN); Clear removes it (back to "silent"). The button matching the
 * driver's current status is highlighted and disabled. The change also
 * refreshes the Discord embed (handled server-side).
 */

type Status = "ACCEPTED" | "DECLINED" | "TENTATIVE";

const BUTTONS: { value: Status; label: string; on: string; off: string }[] = [
  {
    value: "ACCEPTED",
    label: "Accept",
    on: "bg-emerald-600 text-white",
    off: "border border-emerald-800 text-emerald-300 hover:bg-emerald-900/40",
  },
  {
    value: "DECLINED",
    label: "Decline",
    on: "bg-red-600 text-white",
    off: "border border-red-800 text-red-300 hover:bg-red-900/40",
  },
  {
    value: "TENTATIVE",
    label: "Tentative",
    on: "bg-amber-600 text-white",
    off: "border border-amber-800 text-amber-300 hover:bg-amber-900/40",
  },
];

export default function AdminRsvpControl({
  roundId,
  registrationId,
  currentStatus,
}: {
  roundId: string;
  registrationId: string;
  currentStatus: Status | null;
}) {
  const [pending, startTransition] = useTransition();

  function set(status: Status | "CLEAR") {
    startTransition(async () => {
      await adminSetRsvpAction(roundId, registrationId, status);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {BUTTONS.map((b) => {
        const active = currentStatus === b.value;
        return (
          <button
            key={b.value}
            type="button"
            onClick={() => set(b.value)}
            disabled={pending || active}
            title={active ? `Already ${b.label.toLowerCase()}` : `Set ${b.label}`}
            className={`rounded px-2 py-1 text-xs font-medium disabled:cursor-default disabled:opacity-60 ${
              active ? b.on : b.off
            }`}
          >
            {b.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => set("CLEAR")}
        disabled={pending || currentStatus === null}
        title="Remove this RSVP (back to silent)"
        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-default disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  );
}
