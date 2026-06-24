"use client";

import { useMemo, useState } from "react";
import type { TeamClassGroup } from "@/lib/standings";

type SortDir = "asc" | "desc";
type SortKey = "pos" | "name" | "total" | `round:${string}`;

/**
 * Interactive race-by-race team standings table (IEC / SFL team championship).
 *
 * Mirrors RaceByRaceDriverTable: search by team name, sortable columns
 * (Pos, Total, every per-round cell), and a frozen Pos + Team column.
 * The Pos number is the championship rank and stays attached to the team
 * when re-sorting by another column.
 */
export function RaceByRaceTeamTable({ group }: { group: TeamClassGroup }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Union of all rounds any team in this class entered, ordered by round no.
  const roundsList = useMemo(() => {
    const map = new Map<string, { number: number; name: string }>();
    for (const t of group.teams)
      for (const r of t.rounds)
        map.set(r.roundId, { number: r.roundNumber, name: r.roundName });
    return [...map.entries()]
      .map(([id, v]) => ({ roundId: id, ...v }))
      .sort((a, b) => a.number - b.number);
  }, [group]);

  // Championship rank — teams already arrive sorted by totalPoints desc.
  const ranked = useMemo(
    () => group.teams.map((t, i) => ({ team: t, rank: i + 1 })),
    [group]
  );

  function roundPoints(team: TeamClassGroup["teams"][number], roundId: string): number {
    const cell = team.rounds.find((r) => r.roundId === roundId);
    return cell ? cell.points : Number.NEGATIVE_INFINITY;
  }

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = ranked;
    if (q) list = list.filter(({ team }) => team.teamName.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    const valueFor = (entry: { team: TeamClassGroup["teams"][number]; rank: number }): number => {
      if (sortKey === "pos") return entry.rank;
      if (sortKey === "total") return entry.team.totalPoints;
      if (sortKey.startsWith("round:"))
        return roundPoints(entry.team, sortKey.slice("round:".length));
      return entry.rank;
    };
    return [...list].sort((a, b) => {
      if (sortKey === "name") {
        const cmp = a.team.teamName.toLowerCase().localeCompare(b.team.teamName.toLowerCase());
        return cmp !== 0 ? cmp * dir : a.rank - b.rank;
      }
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av === bv) return a.rank - b.rank;
      return (av - bv) * dir;
    });
  }, [ranked, query, sortKey, sortDir]);

  function toggleSort(key: SortKey, defaultDir: SortDir) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  }
  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team…"
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
          {filteredSorted.length} of {group.teams.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th
                onClick={() => toggleSort("pos", "asc")}
                className="sticky left-0 z-10 w-10 cursor-pointer bg-zinc-900/50 px-3 py-2 hover:text-zinc-300"
              >
                Pos{arrow("pos")}
              </th>
              <th
                onClick={() => toggleSort("name", "asc")}
                className="sticky left-10 z-10 cursor-pointer bg-zinc-900/50 border-r border-zinc-700 px-3 py-2 driver-col hover:text-zinc-300"
              >
                Team{arrow("name")}
              </th>
              {roundsList.map((r) => (
                <th
                  key={r.roundId}
                  onClick={() => toggleSort(`round:${r.roundId}`, "desc")}
                  className="min-w-[3.5rem] cursor-pointer px-3 py-2 text-center hover:text-zinc-300"
                  title={r.name}
                >
                  R{r.number}
                  {arrow(`round:${r.roundId}`)}
                </th>
              ))}
              <th
                onClick={() => toggleSort("total", "desc")}
                className="cursor-pointer px-3 py-2 text-right hover:text-zinc-300"
              >
                Total{arrow("total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map(({ team: t, rank }) => {
              const byRound = new Map(t.rounds.map((r) => [r.roundId, r]));
              return (
                <tr key={t.teamId} className="group border-t border-zinc-800">
                  <td className="sticky left-0 z-10 w-10 bg-zinc-900/30 px-3 py-2 font-medium group-hover:bg-zinc-900">
                    {rank}
                  </td>
                  <td className="sticky left-10 z-10 bg-zinc-900/30 border-r border-zinc-700 px-3 py-2 font-medium whitespace-nowrap driver-col group-hover:bg-zinc-900">
                    {t.teamName}
                  </td>
                  {roundsList.map((r) => {
                    const cell = byRound.get(r.roundId);
                    if (!cell)
                      return (
                        <td key={r.roundId} className="px-3 py-2 text-center text-zinc-600">
                          —
                        </td>
                      );
                    return (
                      <td key={r.roundId} className="px-3 py-2 text-center">
                        <div className="text-xs text-zinc-500">
                          {cell.classPosition != null
                            ? "P" + cell.classPosition
                            : cell.finishStatus}
                        </div>
                        <div className="font-semibold tabular-nums">{cell.points}</div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {t.totalPoints}
                  </td>
                </tr>
              );
            })}
            {filteredSorted.length === 0 && (
              <tr>
                <td colSpan={roundsList.length + 3} className="px-3 py-6 text-center text-zinc-500">
                  No teams match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
