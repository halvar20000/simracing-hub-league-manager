"use client";

import { Fragment, useMemo, useState } from "react";
import { CountryFlag } from "@/components/CountryFlag";
import { EmptyState, ChartIcon } from "@/components/EmptyState";
import type { DriverStanding } from "@/lib/standings";

type StandingsKind = "combined" | "class";
type SortDir = "asc" | "desc";
// Sort keys: fixed columns plus one per round ("round:<roundId>").
type SortKey = "pos" | "total" | "inc" | "ir" | `round:${string}`;

function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

/**
 * Interactive race-by-race driver standings table.
 *
 * Adds three things over the old static table:
 *  - a search box that filters rows by driver name or start number,
 *  - sortable columns (Pos, Total, Inc, iR, and every per-round points cell),
 *  - frozen Pos + Driver columns that stay visible while scrolling right.
 *
 * The Pos number is the championship rank (computed once from the default
 * order) and stays attached to the driver even when the user re-sorts by
 * another column.
 */
export function RaceByRaceDriverTable({
  rows,
  kind,
  participationInCombined,
}: {
  rows: DriverStanding[];
  kind: StandingsKind;
  /** Mirrors ScoringSystem.participationInCombined — drives whether the
   *  per-round Bonus (B) sub-column renders in the Combined view. */
  participationInCombined: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Combined view: hide the Bonus column when participation doesn't count
  // toward combinedTotal (e.g. GT3 WCT). Pro/Am view: always show it.
  const showParticipationCol = kind === "class" || participationInCombined;
  const subColsPerRound = showParticipationCol ? 4 : 3;

  const seasonTotalOf = (r: DriverStanding) =>
    kind === "combined" ? r.combinedTotal : r.classTotal;

  // Championship order — identical to the old static table — assigns the
  // stable rank shown in the Pos column.
  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const at = seasonTotalOf(a);
      const bt = seasonTotalOf(b);
      return (
        Number(b.roundsCompleted > 0) - Number(a.roundsCompleted > 0) ||
        bt - at ||
        a.totalIncidents - b.totalIncidents
      );
    });
    return sorted.map((r, i) => ({ row: r, rank: i + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind]);

  const rounds = ranked[0]?.row.roundPoints ?? [];

  function roundCellValue(r: DriverStanding, roundId: string): number {
    const rp = r.roundPoints.find((p) => p.roundId === roundId);
    if (!rp || !rp.hasResult) return Number.NEGATIVE_INFINITY;
    return kind === "combined" ? rp.combinedPoints : rp.classPoints;
  }

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = ranked;
    if (q) {
      list = list.filter(({ row }) => {
        const name = `${row.driverFirstName ?? ""} ${row.driverLastName ?? ""}`.toLowerCase();
        const num = (row.startNumber ?? "").toLowerCase();
        return name.includes(q) || num.includes(q);
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const valueFor = (entry: { row: DriverStanding; rank: number }): number => {
      const { row, rank } = entry;
      if (sortKey === "pos") return rank;
      if (sortKey === "total") return seasonTotalOf(row);
      if (sortKey === "inc") return row.totalIncidents;
      if (sortKey === "ir") return row.iRating ?? Number.NEGATIVE_INFINITY;
      if (sortKey.startsWith("round:"))
        return roundCellValue(row, sortKey.slice("round:".length));
      return rank;
    };
    return [...list].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av === bv) return a.rank - b.rank; // stable tiebreak by rank
      return (av - bv) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, query, sortKey, sortDir, kind]);

  function toggleSort(key: SortKey, defaultDir: SortDir) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ChartIcon />}
        title="No standings to show yet"
        description="Standings will appear after the first round results are imported."
      />
    );
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // Sticky-column geometry (frozen Pos + Driver). The # column scrolls.
  // Pos: left 0 (w-10). Driver: left 2.5rem, with a right border to mark the
  // edge of the frozen region.
  const stickyHeadBg = "bg-zinc-900";
  const stickyBodyBg = "bg-zinc-950";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search driver or #…"
          className="w-full max-w-xs rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#ff6b35] focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="rounded border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-zinc-500">
          {filteredSorted.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-[11px]">
          <thead className="sticky top-0 z-30 bg-zinc-900 text-zinc-400">
            <tr>
              <th
                rowSpan={2}
                onClick={() => toggleSort("pos", "asc")}
                className={`sticky left-0 top-0 z-40 w-10 cursor-pointer ${stickyHeadBg} px-2 py-2 text-left hover:text-zinc-100`}
              >
                Pos{arrow("pos")}
              </th>
              <th rowSpan={2} className={`${stickyHeadBg} px-2 py-2 text-left`}>#</th>
              <th
                rowSpan={2}
                className={`sticky left-10 top-0 z-40 ${stickyHeadBg} border-r border-zinc-700 px-2 py-2 text-left driver-col`}
              >
                Driver
              </th>
              <th
                rowSpan={2}
                onClick={() => toggleSort("total", "desc")}
                className={`cursor-pointer ${stickyHeadBg} px-2 py-2 text-right hover:text-zinc-100`}
              >
                Total{arrow("total")}
              </th>
              {rounds.map((r) => (
                <th
                  key={r.roundId}
                  colSpan={subColsPerRound}
                  onClick={() => toggleSort(`round:${r.roundId}`, "desc")}
                  className="cursor-pointer border-l border-zinc-800 bg-zinc-900 px-2 py-2 text-center whitespace-nowrap hover:text-zinc-100"
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-[10px] text-zinc-500">
                      R{r.roundNumber} • {formatShortDate(r.roundDate)}
                    </span>
                    <span className="font-display text-xs">
                      {r.roundName}
                      {arrow(`round:${r.roundId}`)}
                    </span>
                  </div>
                </th>
              ))}
              <th
                rowSpan={2}
                onClick={() => toggleSort("inc", "asc")}
                className="cursor-pointer bg-zinc-900 px-2 py-2 text-right hover:text-zinc-100"
              >
                Inc{arrow("inc")}
              </th>
              <th
                rowSpan={2}
                onClick={() => toggleSort("ir", "desc")}
                className="cursor-pointer bg-zinc-900 px-2 py-2 text-right hover:text-zinc-100"
              >
                iR{arrow("ir")}
              </th>
            </tr>
            <tr>
              {rounds.map((r) => (
                <Fragment key={r.roundId}>
                  <th className="border-l border-zinc-800 bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-400">
                    Total
                  </th>
                  <th className="bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500">
                    R
                  </th>
                  {showParticipationCol && (
                    <th className="bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500">
                      B
                    </th>
                  )}
                  <th className="bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500">
                    P
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map(({ row: r, rank }) => {
              const seasonTotal = seasonTotalOf(r);
              return (
                <tr
                  key={r.registrationId}
                  className="group border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td
                    className={`sticky left-0 z-10 w-10 ${stickyBodyBg} px-2 py-1.5 font-medium group-hover:bg-zinc-900`}
                  >
                    {rank}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-500">{r.startNumber ?? "—"}</td>
                  <td
                    className={`sticky left-10 z-10 ${stickyBodyBg} border-r border-zinc-700 px-2 py-1.5 font-medium whitespace-nowrap driver-col group-hover:bg-zinc-900`}
                  >
                    <CountryFlag code={r.countryCode} />
                    {r.driverFirstName} {r.driverLastName}
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-orange-400 tabular-nums">
                    {seasonTotal}
                  </td>
                  {r.roundPoints.map((rp) => {
                    const cellTotal =
                      kind === "combined" ? rp.combinedPoints : rp.classPoints;
                    const dash = <span className="text-zinc-700">—</span>;
                    return (
                      <Fragment key={rp.roundId}>
                        <td
                          className={`border-l border-zinc-800 px-1.5 py-1.5 text-right tabular-nums${
                            rp.dropped ? " line-through opacity-60" : ""
                          }`}
                        >
                          {rp.hasResult ? (
                            <span className="font-semibold text-zinc-200">{cellTotal}</span>
                          ) : (
                            dash
                          )}
                        </td>
                        <td
                          className={`px-1.5 py-1.5 text-right tabular-nums text-zinc-300${
                            rp.dropped ? " line-through opacity-60" : ""
                          }`}
                        >
                          {rp.hasResult &&
                          (kind === "combined" ? rp.rawPoints : rp.classRawPoints) !== 0
                            ? kind === "combined"
                              ? rp.rawPoints
                              : rp.classRawPoints
                            : dash}
                        </td>
                        {showParticipationCol && (
                          <td
                            className={`px-1.5 py-1.5 text-right tabular-nums text-emerald-400${
                              rp.dropped ? " line-through opacity-60" : ""
                            }`}
                          >
                            {rp.hasResult && rp.participationPoints !== 0
                              ? rp.participationPoints
                              : dash}
                          </td>
                        )}
                        <td className="px-1.5 py-1.5 text-right tabular-nums text-red-400">
                          {rp.hasResult && rp.penaltyPoints !== 0
                            ? `−${rp.penaltyPoints}`
                            : dash}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">
                    {r.totalIncidents}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">
                    {r.iRating ?? "—"}
                  </td>
                </tr>
              );
            })}
            {filteredSorted.length === 0 && (
              <tr>
                <td colSpan={4 + rounds.length * subColsPerRound + 2} className="px-3 py-6 text-center text-zinc-500">
                  No drivers match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
