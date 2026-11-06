"use client";

import { useMemo, useState } from "react";
import {
  PENALTY_LEVELS,
  PENALTY_LEVEL_LABEL,
  SPECIAL_MEASURE_LEVEL,
} from "@/lib/penalty-categories";

export type PenaltyDriverOption = {
  registrationId: string;
  label: string;
  /** Team-mode seasons (IEC): the car (team) this driver sat in — options
   *  are grouped by it, and the penalty is issued to that team. */
  group?: string;
};

/** Team-mode seasons (IEC): one car of the round — the penalty recipient. */
export type PenaltyCarOption = {
  teamId: string;
  label: string;
  /** Drivers who sat in this car; naming one is optional. */
  crew: { registrationId: string; label: string }[];
};

export type PenaltyRowInit = {
  /** Team mode: the team (car) penalised. Empty in solo leagues. */
  teamId?: string;
  /** Solo: the driver penalised. Team mode: the driver named, or "". */
  registrationId: string;
  level: string; // "" | "0" | "1" | "2" | "3" | "4"
  reason: string;
  /** Free text, only used by category 4 (Sondermaßnahme). */
  specialMeasure?: string;
};

type Row = PenaltyRowInit & { key: string; teamId: string; specialMeasure: string };

const SPECIAL = String(SPECIAL_MEASURE_LEVEL);

let rowSeq = 0;
function newRow(init?: Partial<PenaltyRowInit>): Row {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
    teamId: init?.teamId ?? "",
    registrationId: init?.registrationId ?? "",
    level: init?.level ?? "",
    reason: init?.reason ?? "",
    specialMeasure: init?.specialMeasure ?? "",
  };
}

export function PenaltyRowsEditor({
  drivers,
  pointsTable,
  initialRows,
  name = "penaltiesJson",
  teamMode = false,
  cars = [],
  accusedTeamIds = [],
}: {
  drivers: PenaltyDriverOption[];
  pointsTable: Record<string, number>;
  initialRows: PenaltyRowInit[];
  name?: string;
  /** IEC: the penalty goes to the TEAM (picked from `cars`); naming the
   *  driver at the wheel is optional. */
  teamMode?: boolean;
  cars?: PenaltyCarOption[];
  /** Team mode: the report's accused cars, for "add all accused teams". */
  accusedTeamIds?: string[];
}) {
  // Options grouped by car (team) when groups are present, in first-seen order.
  const groups = useMemo(() => {
    const m = new Map<string, PenaltyDriverOption[]>();
    for (const d of drivers) {
      const g = d.group ?? "";
      m.set(g, [...(m.get(g) ?? []), d]);
    }
    return [...m.entries()];
  }, [drivers]);
  const grouped = groups.some(([g]) => g !== "");
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0 ? initialRows.map((r) => newRow(r)) : [newRow()]
  );

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => setRows((rs) => [...rs, newRow()]);

  // A row is filled once it names its recipient: the team in team mode, the
  // driver otherwise.
  const recipient = (r: Row) => (teamMode ? r.teamId : r.registrationId);
  const carById = useMemo(
    () => new Map(cars.map((c) => [c.teamId, c])),
    [cars]
  );

  // Collective cases (a mass false start): one row per accused car, taking
  // the category and comment of the first filled row so the steward sets
  // them once. Cars already in the table are skipped.
  const missingAccused = accusedTeamIds.filter(
    (id) => carById.has(id) && !rows.some((r) => r.teamId === id)
  );
  const addAccused = () =>
    setRows((rs) => {
      const tpl = rs.find((r) => r.level !== "") ?? rs[0];
      const kept = rs.filter((r) => r.teamId);
      const extra = missingAccused.map((teamId) =>
        newRow({
          teamId,
          registrationId: "",
          level: tpl?.level ?? "",
          reason: tpl?.reason ?? "",
          specialMeasure: tpl?.specialMeasure ?? "",
        })
      );
      return [...kept, ...extra];
    });

  const ptsFor = (level: string) =>
    level === "" || level === SPECIAL ? null : pointsTable[level] ?? 0;

  const totalPoints = rows.reduce(
    (sum, r) =>
      sum +
      (recipient(r) && r.level !== "" && r.level !== SPECIAL
        ? pointsTable[r.level] ?? 0
        : 0),
    0
  );

  // Serialize only rows that actually name a recipient.
  const serialized = JSON.stringify(
    rows
      .filter((r) => recipient(r))
      .map((r) => ({
        ...(teamMode ? { teamId: r.teamId } : {}),
        registrationId: r.registrationId,
        level: r.level === "" ? null : parseInt(r.level, 10),
        reason: r.reason.trim(),
        specialMeasure:
          r.level === SPECIAL ? r.specialMeasure.trim() : "",
      }))
  );

  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-xs text-zinc-500">
        {teamMode ? (
          <>
            Strafempfänger — die Strafe geht an das <strong>Team (Auto)</strong>.
            Wähle das Team; den Fahrer am Steuer zu nennen ist optional. Bei
            einem Sammelfall (z.&nbsp;B. kollektiver Fehlstart) legt „Alle
            beschuldigten Teams übernehmen“ eine Zeile pro Auto an, mit
            Kategorie und Kommentar der ersten Zeile.
          </>
        ) : (
          <>Strafempfänger — Wähle einen oder mehrere Fahrer (auch der Melder ist
        wählbar).</>
        )} Jede Zeile kann eine eigene Kategorie und einen eigenen
        öffentlichen Kommentar haben. <strong>Kategorie 4</strong> zieht keine
        Strafpunkte ab — dort wird die Maßnahme als Freitext eingetragen und mit
        der Entscheidung veröffentlicht.
      </p>

      <input type="hidden" name={name} value={serialized} />

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="px-2 py-1 font-semibold">
                {teamMode ? "Team (Auto) / Fahrer optional" : "Fahrer"}
              </th>
              <th className="px-2 py-1 font-semibold">Kategorie</th>
              <th className="px-2 py-1 font-semibold">
                Kommentar (öffentlich)
              </th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pts = ptsFor(r.level);
              const isSpecial = r.level === SPECIAL;
              return (
                <tr
                  key={r.key}
                  className="border-t border-zinc-800 align-top"
                >
                  <td className="px-2 py-2">
                    {teamMode ? (
                      <div className="space-y-1.5">
                        <select
                          value={r.teamId}
                          onChange={(e) => {
                            const teamId = e.target.value;
                            // A named driver must belong to the chosen car.
                            const crew = carById.get(teamId)?.crew ?? [];
                            update(r.key, {
                              teamId,
                              registrationId: crew.some((m) => m.registrationId === r.registrationId)
                                ? r.registrationId
                                : "",
                            });
                          }}
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        >
                          <option value="">— Team wählen —</option>
                          {cars.map((c) => (
                            <option key={c.teamId} value={c.teamId}>
                              {accusedTeamIds.includes(c.teamId) ? "⚑ " : ""}
                              {c.label}
                            </option>
                          ))}
                        </select>
                        {r.teamId && (carById.get(r.teamId)?.crew.length ?? 0) > 0 && (
                          <select
                            value={r.registrationId}
                            onChange={(e) =>
                              update(r.key, { registrationId: e.target.value })
                            }
                            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
                          >
                            <option value="">Fahrer: nicht genannt</option>
                            {carById.get(r.teamId)!.crew.map((m) => (
                              <option key={m.registrationId} value={m.registrationId}>
                                Fahrer: {m.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                    <select
                      value={r.registrationId}
                      onChange={(e) =>
                        update(r.key, { registrationId: e.target.value })
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    >
                      <option value="">
                        {teamMode ? "— Auto / Fahrer wählen —" : "— Fahrer wählen —"}
                      </option>
                      {grouped
                        ? groups.map(([g, opts]) => (
                            <optgroup key={g || "_"} label={g || "Sonstige"}>
                              {opts.map((d) => (
                                <option key={d.registrationId} value={d.registrationId}>
                                  {d.label}
                                </option>
                              ))}
                            </optgroup>
                          ))
                        : drivers.map((d) => (
                            <option key={d.registrationId} value={d.registrationId}>
                              {d.label}
                            </option>
                          ))}
                    </select>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={r.level}
                      onChange={(e) => update(r.key, { level: e.target.value })}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    >
                      <option value="">— keine —</option>
                      {PENALTY_LEVELS.map((lv) => (
                        <option key={lv} value={String(lv)}>
                          {lv === SPECIAL_MEASURE_LEVEL
                            ? `${PENALTY_LEVEL_LABEL[lv]} — keine Punkte`
                            : `${PENALTY_LEVEL_LABEL[lv]} — ${pointsTable[String(lv)] ?? 0} pts`}
                        </option>
                      ))}
                    </select>
                    {pts != null && pts > 0 && (
                      <div className="mt-1 text-xs text-amber-200">
                        −{pts} Punkt{pts === 1 ? "" : "e"}
                      </div>
                    )}
                    {isSpecial && (
                      <div className="mt-1 text-xs text-cyan-300">
                        Keine Strafpunkte
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={r.reason}
                      onChange={(e) => update(r.key, { reason: e.target.value })}
                      placeholder={teamMode ? "Begründung für dieses Team (optional)" : "Begründung für diesen Fahrer (optional)"}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    />
                    {isSpecial && (
                      <div className="mt-2">
                        <label className="mb-1 block text-[10px] uppercase tracking-widest text-cyan-300">
                          Maßnahme (öffentlich)
                        </label>
                        <input
                          type="text"
                          value={r.specialMeasure}
                          onChange={(e) =>
                            update(r.key, { specialMeasure: e.target.value })
                          }
                          placeholder="z.B. Verwarnung, Startplatzstrafe nächste Runde, Gespräch mit der Rennleitung …"
                          className="w-full rounded border border-cyan-800/70 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r.key)}
                      disabled={rows.length <= 1}
                      title="Zeile entfernen"
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={add}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            {teamMode ? "+ Team hinzufügen" : "+ Fahrer hinzufügen"}
          </button>
          {teamMode && missingAccused.length > 0 && (
            <button
              type="button"
              onClick={addAccused}
              className="rounded border border-orange-800/70 px-3 py-1.5 text-xs text-orange-200 hover:bg-orange-950/40"
            >
              ⚑ Alle beschuldigten Teams übernehmen ({missingAccused.length})
            </button>
          )}
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-zinc-400">
            Summe:{" "}
            <strong className="text-amber-200">{totalPoints}</strong> Strafpunkte
          </span>
        )}
      </div>
    </div>
  );
}
