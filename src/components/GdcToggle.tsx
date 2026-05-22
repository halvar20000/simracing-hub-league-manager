"use client";

import { setRegistrationGdc } from "@/lib/actions/admin-registrations";

/**
 * Inline GDC (Gentleman Driver Class) membership toggle for the admin roster.
 * Auto-submits on change. GDC is a parallel, opt-in class — flagging a driver
 * here does NOT change their Pro/Am classification or any other standing.
 */
export default function GdcToggle({
  registrationId,
  value,
}: {
  registrationId: string;
  value: boolean;
}) {
  return (
    <form action={setRegistrationGdc} className="inline-block">
      <input type="hidden" name="registrationId" value={registrationId} />
      <select
        name="value"
        defaultValue={value ? "YES" : "NO"}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        title="Gentleman Driver Class membership"
        className={`rounded border px-2 py-1 text-xs ${
          value
            ? "border-amber-600/50 bg-amber-950/40 text-amber-200"
            : "border-zinc-700/50 bg-zinc-900 text-zinc-500"
        }`}
      >
        <option value="NO">—</option>
        <option value="YES">GDC</option>
      </select>
    </form>
  );
}
