"use client";

import { updateRegistrationFlag } from "@/lib/actions/admin-registrations";

const COLOR: Record<string, string> = {
  PENDING: "border-amber-700/50 bg-amber-950/40 text-amber-200",
  YES: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  NO: "border-red-800/50 bg-red-950/40 text-red-200",
};

export default function RegistrationFlagSelect({
  registrationId,
  field,
  value,
}: {
  registrationId: string;
  field: "startingFeePaid" | "iracingInvitationSent" | "iracingInvitationAccepted";
  value: "PENDING" | "YES" | "NO";
}) {
  const cls = COLOR[value] ?? COLOR.PENDING;
  return (
    <form action={updateRegistrationFlag}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="PENDING">Pending</option>
        <option value="YES">Yes</option>
        <option value="NO">No</option>
      </select>
    </form>
  );
}
