"use client";

import { setRegistrationProAmClass } from "@/lib/actions/admin-registrations";

const COLOR: Record<string, string> = {
  PRO: "border-emerald-700/50 bg-emerald-950/40 text-emerald-200",
  AM: "border-zinc-700/50 bg-zinc-900 text-zinc-300",
  AUTO: "border-zinc-700/50 bg-zinc-900 text-zinc-500 italic",
};

export default function ProAmOverrideSelect({
  registrationId,
  value,
  suggested,
}: {
  registrationId: string;
  // current stored value: "PRO" | "AM" | null. Null is "Auto".
  value: "PRO" | "AM" | null;
  // for admin reference; not submitted
  suggested: "PRO" | "AM" | "UNRANKED";
}) {
  const current = value ?? "AUTO";
  const cls = COLOR[current] ?? COLOR.AUTO;
  return (
    <form action={setRegistrationProAmClass} className="inline-block">
      <input type="hidden" name="registrationId" value={registrationId} />
      <select
        name="value"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        title={`Algorithm suggests: ${suggested}`}
        className={`rounded border px-2 py-1 text-xs ${cls}`}
      >
        <option value="AUTO">Auto</option>
        <option value="PRO">Pro</option>
        <option value="AM">Am</option>
      </select>
    </form>
  );
}
