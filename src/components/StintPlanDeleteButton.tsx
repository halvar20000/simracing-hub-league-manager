"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStintPlan } from "@/lib/actions/stint-plans";
import { useT } from "@/components/planner/PlannerUi";

/** Admin-only delete for a stint plan (shown only to admins by the page). */
export default function StintPlanDeleteButton({
  planId,
  title,
}: {
  planId: string;
  title: string;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(t.gallery.deleteConfirm(title))) return;
    setBusy(true);
    const res = await deleteStintPlan(planId);
    if (res.ok) router.refresh();
    else setBusy(false);
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded border border-red-900/60 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
      title={t.gallery.deleteHint}
    >
      {busy ? t.gallery.deleting : t.gallery.deletePlan}
    </button>
  );
}
