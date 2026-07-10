"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { duplicateStintPlan } from "@/lib/actions/stint-plans";

/** Clones a stint plan and opens the copy (storing its edit token locally so
 *  the person who duplicated it can edit the copy). */
export default function StintPlanDuplicateButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const res = await duplicateStintPlan(planId);
    if (res.ok) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`stintplan:${res.id}`, res.editToken);
      }
      router.push(`/stint-planner/${res.id}`);
    } else {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
    >
      {busy ? "Copying…" : "Duplicate"}
    </button>
  );
}
