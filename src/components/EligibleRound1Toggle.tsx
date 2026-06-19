"use client";

import { setRegistrationEligibleRound1 } from "@/lib/actions/admin-registrations";

/**
 * Inline "Startberechtigt Round 1" (Eligible R1) toggle for the GT3 WCT admin
 * roster. Auto-submits on change. When a confirmed driver declines a round,
 * the waiting-list fill-in offer is only sent to drivers flagged eligible here.
 * Brand-new, unclassified drivers default to NOT eligible until the admin
 * checks this box.
 */
export default function EligibleRound1Toggle({
  registrationId,
  value,
}: {
  registrationId: string;
  value: boolean;
}) {
  return (
    <form action={setRegistrationEligibleRound1} className="inline-block">
      <input type="hidden" name="registrationId" value={registrationId} />
      <select
        name="value"
        defaultValue={value ? "YES" : "NO"}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        title="Startberechtigt Round 1 — may be offered a freed race slot from the waiting list"
        className={`rounded border px-2 py-1 text-xs ${
          value
            ? "border-emerald-600/50 bg-emerald-950/40 text-emerald-200"
            : "border-zinc-700/50 bg-zinc-900 text-zinc-500"
        }`}
      >
        <option value="NO">—</option>
        <option value="YES">Eligible</option>
      </select>
    </form>
  );
}
