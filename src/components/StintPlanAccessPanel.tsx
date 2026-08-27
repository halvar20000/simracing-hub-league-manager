"use client";

import { useState } from "react";
import {
  addStintPlanPerson,
  removeStintPlanPerson,
} from "@/lib/actions/stint-plan-people";
import type { PlanPeople } from "@/lib/stint-plan-people";
import type { ClsDriverOption } from "@/lib/cls-drivers";

/**
 * "Who can open this plan" box on a saved plan page.
 *
 * Drivers are listed but not editable here: they have access because they are
 * in the line-up, so the way to remove one is to take them out of the line-up.
 * The add/remove control is for people who do NOT drive — team boss, spotter,
 * engineer — and only the plan's creator (or an admin) sees it.
 */
export default function StintPlanAccessPanel({
  planId,
  initial,
  clsDrivers,
}: {
  planId: string;
  initial: PlanPeople;
  clsDrivers: ClsDriverOption[];
}) {
  const [people, setPeople] = useState<PlanPeople>(initial);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const taken = new Set<string>([
    ...(people.owner ? [people.owner.id] : []),
    ...people.drivers.map((d) => d.id),
    ...people.extra.map((d) => d.id),
  ]);
  const options = clsDrivers.filter((d) => !taken.has(d.id));

  async function add() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const res = await addStintPlanPerson(planId, pick);
    if (res.ok) {
      setPeople(res.people);
      setPick("");
    } else setError(res.error);
    setBusy(false);
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    const res = await removeStintPlanPerson(planId, userId);
    if (res.ok) setPeople(res.people);
    else setError(res.error);
    setBusy(false);
  }

  const total = (people.owner ? 1 : 0) + people.drivers.length + people.extra.length;

  return (
    <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-zinc-200">
          🔒 Who can open this plan
          <span className="ml-2 font-normal text-zinc-500">
            {total} {total === 1 ? "person" : "people"} + admins
          </span>
        </span>
        <span className="text-xs text-zinc-500">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 px-4 py-4 text-sm">
          <p className="text-xs text-zinc-500">
            A stint plan is private. The driver who created it, everyone in the
            line-up and the people added below can open and edit it — nobody
            else, even with the link. CLS admins can always get in.
          </p>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Created by
            </h3>
            <p className="text-zinc-300">
              {people.owner ? (
                people.owner.name
              ) : (
                <span className="text-zinc-500">
                  Not recorded — this plan is older than the access rules. The
                  drivers in it (and admins) can open it.
                </span>
              )}
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Drivers in the plan
            </h3>
            {people.drivers.length === 0 ? (
              <p className="text-zinc-500">
                No CLS drivers in the line-up yet — add drivers below in the
                planner and they get access automatically.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {people.drivers.map((d) => (
                  <li
                    key={d.id}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                  >
                    {d.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Also allowed in
            </h3>
            {people.extra.length === 0 ? (
              <p className="text-zinc-500">Nobody yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {people.extra.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                  >
                    {d.name}
                    {people.canManage && (
                      <button
                        onClick={() => remove(d.id)}
                        disabled={busy}
                        className="text-zinc-500 hover:text-red-400 disabled:opacity-50"
                        title={`Remove ${d.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {people.canManage && (
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                disabled={busy}
                className="min-w-[14rem] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
              >
                <option value="">Add someone who isn&rsquo;t driving…</option>
                {options.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={busy || !pick}
                className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
              >
                {busy ? "…" : "Add"}
              </button>
              <span className="text-xs text-zinc-500">
                Team boss, spotter, engineer — same rights as a driver.
              </span>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </section>
  );
}
