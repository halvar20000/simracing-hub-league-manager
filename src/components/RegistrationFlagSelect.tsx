"use client";

import { updateRegistrationFlag } from "@/lib/actions/admin-registrations";

type Field =
  | "startingFeePaid"
  | "iracingInvitationSent"
  | "iracingInvitationAccepted";

const LABELS: Record<Field, { YES: string; NO: string }> = {
  startingFeePaid: { YES: "Paid", NO: "Not paid" },
  iracingInvitationSent: { YES: "Sent", NO: "Not sent" },
  iracingInvitationAccepted: { YES: "Accepted", NO: "Not accepted" },
};

const COLOR: Record<string, string> = {
  YES: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  NO: "border-red-800/50 bg-red-950/40 text-red-200",
};

export default function RegistrationFlagSelect({
  registrationId,
  field,
  value,
}: {
  registrationId: string;
  field: Field;
  // PENDING is still a valid enum but no longer offered in the UI; if a row
  // somehow still has it, render as NO so the select isn't blank.
  value: "PENDING" | "YES" | "NO";
}) {
  const safeValue = value === "PENDING" ? "NO" : value;
  const labels = LABELS[field];
  const cls = COLOR[safeValue] ?? COLOR.NO;
  return (
    <form action={updateRegistrationFlag}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={safeValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="NO">{labels.NO}</option>
        <option value="YES">{labels.YES}</option>
      </select>
    </form>
  );
}
