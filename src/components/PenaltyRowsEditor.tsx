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
};

export type PenaltyRowInit = {
  registrationId: string;
  level: string; // "" | "0" | "1" | "2" | "3" | "4"
  reason: string;
  /** Free text, only used by category 4 (Sondermaßnahme). */
  specialMeasure?: string;
};

type Row = PenaltyRowInit & { key: string; specialMeasure: string };

const SPECIAL = String(SPECIAL_MEASURE_LEVEL);

let rowSeq = 0;
function newRow(init?: Partial<PenaltyRowInit>): Row {
  rowSeq += 1;
  return {
    key: `r${rowSeq}`,
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
}: {
  drivers: PenaltyDriverOption[];
  pointsTable: Record<string, number>;
  initialRows: PenaltyRowInit[];
  name?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0 ? initialRows.map((r) => newRow(r)) : [newRow()]
  );

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => setRows((rs) => [...rs, newRow()]);

  const ptsFor = (level: string) =>
    level === "" || level === SPECIAL ? null : pointsTable[level] ?? 0;

  const totalPoints = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum +
          (r.registrationId && r.level !== "" && r.level !== SPECIAL
            ? pointsTable[r.level] ?? 0
            : 0),
        0
      ),
    [rows, pointsTable]
  );

  // Serialize only rows that actually name a driver.
  const serialized = JSON.stringify(
    rows
      .filter((r) => r.registrationId)
      .map((r) => ({
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
        Strafempfänger — Wähle einen oder mehrere Fahrer (auch der Melder ist
        wählbar). Jede Zeile kann eine eigene Kategorie und einen eigenen
        öffentlichen Kommentar haben. <strong>Kategorie 4</strong> zieht keine
        Strafpunkte ab — dort wird die Maßnahme als Freitext eingetragen und mit
        der Entscheidung veröffentlicht.
      </p>

      <input type="hidden" name={name} value={serialized} />

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="px-2 py-1 font-semibold">Fahrer</th>
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
                    <select
                      value={r.registrationId}
                      onChange={(e) =>
                        update(r.key, { registrationId: e.target.value })
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    >
                      <option value="">— Fahrer wählen —</option>
                      {drivers.map((d) => (
                        <option key={d.registrationId} value={d.registrationId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
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
                      placeholder="Begründung für diesen Fahrer (optional)"
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

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          + Fahrer hinzufügen
        </button>
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
