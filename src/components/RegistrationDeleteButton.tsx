"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRegistration } from "@/lib/actions/admin-registrations";

/**
 * Admin-only: delete a registration outright instead of parking it on
 * Withdrawn / Rejected. The server action refuses when race results,
 * penalties, incident reports or team line-up rows still point at it, and
 * says which — that message is shown here.
 */
export default function RegistrationDeleteButton({
  registrationId,
  driverName,
}: {
  registrationId: string;
  driverName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    if (
      !window.confirm(
        `Delete ${driverName} from this season's roster?\n\nThe registration is removed for good. The driver's CLS account stays.`
      )
    )
      return;
    setBusy(true);
    const res = await deleteRegistration(registrationId);
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
        title="Delete this registration for good (blocked once the driver has results)"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full z-20 mt-1 block w-72 rounded border border-red-900 bg-zinc-950 p-2 text-left text-[11px] leading-snug text-red-200 shadow-lg"
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-1 block text-[10px] text-zinc-400 underline hover:text-zinc-200"
          >
            Close
          </button>
        </span>
      )}
    </span>
  );
}
