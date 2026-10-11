"use client";

import { useMemo, useState } from "react";
import type { RoundCar } from "@/lib/round-cars";

/**
 * Team-mode incident picker (IEC): the reporter names the CAR (team entry),
 * and — optionally — the driver who was at the wheel. The team is what gets
 * reported and penalised; the driver is secondary information.
 *
 * Submits `involvedTeamIds` (one per ticked car), `involvedTeamDriver:<teamId>`
 * for each named driver, and the named drivers again as
 * `involvedRegistrationIds`, so the existing driver handling (visibility,
 * notifications) keeps working.
 */
const LABELS = {
  en: {
    search: "Search by team or driver…",
    none: "No cars match.",
    driver: "Driver (optional):",
    driverUnknown: "— not sure —",
    selected: (n: number) =>
      `${n} car${n === 1 ? "" : "s"} selected — the team is reported; naming the driver is optional.`,
  },
  de: {
    search: "Team oder Fahrer suchen…",
    none: "Kein Auto gefunden.",
    driver: "Fahrer (optional):",
    driverUnknown: "— unbekannt —",
    selected: (n: number) =>
      `${n} Auto${n === 1 ? "" : "s"} ausgewählt — gemeldet wird das Team, der Fahrer ist optional.`,
  },
};

export function InvolvedTeamsPicker({
  cars,
  excludeTeamId = null,
  initialSelected = [],
  lang = "en",
}: {
  cars: RoundCar[];
  /** The reporter's own car — never offered. */
  excludeTeamId?: string | null;
  /** Pre-selection (admin edit): ticked teams and the driver named for each. */
  initialSelected?: { teamId: string; registrationId: string | null }[];
  lang?: "en" | "de";
}) {
  const labels = LABELS[lang];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, string>>(
    () =>
      new Map(
        initialSelected
          .filter((s) => s.teamId !== excludeTeamId)
          .map((s) => [s.teamId, s.registrationId ?? ""])
      )
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cars
      .filter((c) => c.teamId !== excludeTeamId)
      .filter(
        (c) =>
          !q ||
          c.teamName.toLowerCase().includes(q) ||
          c.crew.some((m) => m.label.toLowerCase().includes(q))
      );
  }, [cars, query, excludeTeamId]);

  const toggle = (teamId: string) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.set(teamId, "");
      return next;
    });
  const setDriver = (teamId: string, regId: string) =>
    setSelected((prev) => new Map(prev).set(teamId, regId));

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={labels.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="max-h-80 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">{labels.none}</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {visible.map((c) => {
              const isOn = selected.has(c.teamId);
              return (
                <li key={c.teamId} className={isOn ? "bg-zinc-900/60" : ""}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(c.teamId)}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span className="flex-1 text-sm font-semibold text-zinc-200">
                      {c.teamName}
                    </span>
                    {c.classLabel && (
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">
                        {c.classLabel}
                      </span>
                    )}
                  </label>
                  {isOn && c.crew.length > 0 && (
                    <div className="flex items-center gap-2 px-3 pb-2 pl-10">
                      <span className="text-xs text-zinc-400">{labels.driver}</span>
                      <select
                        value={selected.get(c.teamId) ?? ""}
                        onChange={(e) => setDriver(c.teamId, e.target.value)}
                        className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      >
                        <option value="">{labels.driverUnknown}</option>
                        {c.crew.map((m) => (
                          <option key={m.registrationId} value={m.registrationId}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-zinc-500">{labels.selected(selected.size)}</p>
      {[...selected.entries()].map(([teamId, regId]) => (
        <span key={teamId}>
          <input type="hidden" name="involvedTeamIds" value={teamId} />
          {regId && (
            <>
              <input type="hidden" name="involvedRegistrationIds" value={regId} />
              <input type="hidden" name={`involvedTeamDriver:${teamId}`} value={regId} />
            </>
          )}
        </span>
      ))}
    </div>
  );
}
