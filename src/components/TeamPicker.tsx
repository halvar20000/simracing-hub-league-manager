"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Searchable team picker for the registration form (GT3 WCT).
 *
 * One combobox that replaces the old "pick from dropdown OR type a new name"
 * pair. As the driver types it filters the team list; teams already at the
 * driver cap show greyed-out as "already full" and cannot be picked. Typing a
 * name that matches no team offers "create new team". The driver's own
 * current team is always selectable.
 *
 * Emits two hidden inputs read by createRegistration:
 *   - teamId       — set when an existing team is chosen
 *   - newTeamName  — set when a new team name is typed
 * Both empty = race independently.
 *
 * `knownTeams` are team names from the league's earlier seasons (teams are
 * per season, so a new season starts empty). Picking one sends it as
 * newTeamName — the action finds-or-creates the team under exactly that
 * name, so nobody has to retype it (and a typo can't split a team).
 */

type Team = { id: string; name: string; memberCount: number };

type Selection =
  | { kind: "none" }
  | { kind: "team"; id: string; name: string }
  | { kind: "new"; name: string };

export default function TeamPicker({
  teams,
  limit,
  currentTeamId,
  knownTeams = [],
}: {
  teams: Team[];
  limit: number;
  currentTeamId: string | null;
  knownTeams?: string[];
}) {
  const [selection, setSelection] = useState<Selection>(() => {
    if (currentTeamId) {
      const t = teams.find((x) => x.id === currentTeamId);
      if (t) return { kind: "team", id: t.id, name: t.name };
    }
    return { kind: "none" };
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on any click outside the component.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // A team the driver is already on never counts the driver against itself.
  function isFull(t: Team): boolean {
    const effective = t.memberCount - (t.id === currentTeamId ? 1 : 0);
    return effective >= limit;
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? teams.filter((t) => t.name.toLowerCase().includes(q))
    : teams;
  const filteredKnown = q
    ? knownTeams.filter((n) => n.toLowerCase().includes(q))
    : knownTeams;
  const exactKnown = knownTeams.find((n) => n.toLowerCase() === q) ?? null;
  const exactExists = teams.some((t) => t.name.toLowerCase() === q);
  const showCreate = q.length > 0 && !exactExists && !exactKnown;

  function pickTeam(t: Team) {
    if (isFull(t) && t.id !== currentTeamId) return;
    setSelection({ kind: "team", id: t.id, name: t.name });
    setOpen(false);
    setQuery("");
  }
  function pickNew() {
    const name = query.trim();
    if (!name) return;
    setSelection({ kind: "new", name });
    setOpen(false);
    setQuery("");
  }
  function pickKnown(name: string) {
    setSelection({ kind: "new", name });
    setOpen(false);
    setQuery("");
  }
  function pickNone() {
    setSelection({ kind: "none" });
    setOpen(false);
    setQuery("");
  }

  const display =
    selection.kind === "team"
      ? selection.name
      : selection.kind === "new"
      ? knownTeams.includes(selection.name)
        ? selection.name
        : `${selection.name}  (new team)`
      : "No team / Independent";

  return (
    <fieldset className="space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-4">
      <legend className="px-2 text-sm text-zinc-300">Team</legend>

      {/* Consumed by createRegistration */}
      <input
        type="hidden"
        name="teamId"
        value={selection.kind === "team" ? selection.id : ""}
      />
      <input
        type="hidden"
        name="newTeamName"
        value={selection.kind === "new" ? selection.name : ""}
      />

      <div ref={boxRef} className="relative">
        <input
          type="text"
          value={open ? query : display}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
              e.currentTarget.blur();
            } else if (e.key === "Enter") {
              // Never let Enter submit the whole form from this field.
              e.preventDefault();
              const firstSelectable = filtered.find(
                (t) => !isFull(t) || t.id === currentTeamId
              );
              if (exactExists) {
                const exact = teams.find((t) => t.name.toLowerCase() === q);
                if (exact) pickTeam(exact);
              } else if (exactKnown) {
                pickKnown(exactKnown);
              } else if (showCreate) {
                pickNew();
              } else if (firstSelectable) {
                pickTeam(firstSelectable);
              }
            }
          }}
          placeholder="Search for a team, or type a new team name…"
          className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm ${
            !open && selection.kind === "none"
              ? "text-zinc-500"
              : "text-zinc-100"
          }`}
        />

        {open && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-zinc-700 bg-zinc-900 shadow-lg">
            <button
              type="button"
              onClick={pickNone}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              No team / Independent
            </button>

            {filtered.length === 0 && filteredKnown.length === 0 && !showCreate && (
              <div className="px-3 py-2 text-sm text-zinc-500">
                No teams match — keep typing to create one.
              </div>
            )}

            {filtered.map((t) => {
              const mine = t.id === currentTeamId;
              const full = isFull(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={full && !mine}
                  onClick={() => pickTeam(t)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    full && !mine
                      ? "cursor-not-allowed bg-red-950/30 text-red-300/60"
                      : "text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>{" "}
                  {mine ? (
                    <span className="text-emerald-400">— your team</span>
                  ) : full ? (
                    <span className="text-red-400/80">
                      ({limit}/{limit}) — already full
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      ({Math.min(t.memberCount, limit)}/{limit})
                    </span>
                  )}
                </button>
              );
            })}

            {filteredKnown.length > 0 && (
              <div className="border-t border-zinc-800 px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-zinc-500">
                Teams from earlier seasons
              </div>
            )}
            {filteredKnown.map((n) => (
              <button
                key={`known-${n}`}
                type="button"
                onClick={() => pickKnown(n)}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              >
                <span className="font-medium">{n}</span>{" "}
                <span className="text-zinc-500">(0/{limit})</span>
              </button>
            ))}

            {showCreate && (
              <button
                type="button"
                onClick={pickNew}
                className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-sm text-orange-300 hover:bg-zinc-800"
              >
                + Create new team: “{query.trim()}”
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Each team is limited to {limit} drivers — full teams are marked and
        can&apos;t be picked. Pick your team from the list (teams from earlier
        seasons are in it too), create a new one by typing its name, or leave
        this as Independent to race without a team.
      </p>
    </fieldset>
  );
}
