"use client";

import { useState } from "react";
import {
  POINT_PENALTY_LEVELS,
  PENALTY_LEVEL_LABEL,
} from "@/lib/penalty-categories";

export function CategoryLevelSelect({
  initialLevel,
  pointsTable,
  name = "categoryLevel",
}: {
  initialLevel: string;
  pointsTable: Record<string, number>;
  name?: string;
}) {
  const [level, setLevel] = useState<string>(initialLevel);
  const pts = level === "" ? null : pointsTable[level] ?? 0;

  return (
    <>
      <select
        name={name}
        value={level}
        onChange={(e) => setLevel(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      >
        <option value="">— (keine Kategorie)</option>
        {POINT_PENALTY_LEVELS.map((lv) => (
          <option key={lv} value={String(lv)}>
            {PENALTY_LEVEL_LABEL[lv]} — {pointsTable[String(lv)] ?? 0} pts
          </option>
        ))}
      </select>
      {pts != null && pts > 0 && (
        <div className="mt-2 rounded border border-amber-900/60 bg-amber-900/30 px-3 py-1.5 text-sm">
          <span className="text-zinc-400">Will deduct:</span>{" "}
          <strong className="text-lg text-amber-200">{pts}</strong>{" "}
          <span className="text-amber-200">
            penalty point{pts === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {pts === 0 && level !== "" && (
        <div className="mt-2 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400">
          Kategorie 0 — keine Strafpunkte.
        </div>
      )}
    </>
  );
}
