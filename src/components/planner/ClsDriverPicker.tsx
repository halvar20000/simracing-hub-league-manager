"use client";

import { useMemo, useRef, useState } from "react";
import type { ClsDriverOption } from "@/lib/cls-drivers";
import { useT } from "@/components/planner/PlannerUi";

const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .toLowerCase()
    .trim();

/**
 * Type-ahead picker for the CLS driver list.
 *
 * The list is every driver with a registration — hundreds of entries — so a
 * plain <select> means scrolling for a name you already know. Type two letters
 * instead: matches on any part of the name, first-name and last-name starts
 * rank first, ↑/↓ + Enter to add, Esc to close. The field keeps focus after a
 * pick so a whole line-up goes in without touching the mouse.
 *
 * Shared: the roster in the planner and the access box both add a CLS person,
 * and that is one interaction, so it is one component. Two of them can sit on
 * the same page, hence `listId` — a duplicated element id would point both
 * comboboxes at the same listbox for a screen reader.
 */
export function ClsDriverPicker({
  options,
  onPick,
  placeholder,
  title,
  disabled = false,
  listId = "cls-driver-hits",
}: {
  options: ClsDriverOption[];
  onPick: (id: string) => void;
  /** Defaults to the roster wording. */
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  listId?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_HITS = 8;
  const matches = useMemo(() => {
    const q = foldName(query);
    if (q === "") return [];
    const scored = options
      .map((d) => {
        const folded = foldName(d.name);
        const idx = folded.indexOf(q);
        if (idx < 0) return null;
        // A name part starting with the query beats a match in the middle.
        const startsPart = folded
          .split(/\s+/)
          .some((part) => part.startsWith(q));
        return { d, rank: idx === 0 ? 0 : startsPart ? 1 : 2 };
      })
      .filter((x): x is { d: ClsDriverOption; rank: number } => x != null)
      .sort((a, b) => a.rank - b.rank || a.d.name.localeCompare(b.d.name));
    return scored.slice(0, MAX_HITS).map((x) => x.d);
  }, [options, query]);

  const pick = (d: ClsDriverOption | undefined) => {
    if (!d) return;
    onPick(d.id);
    setQuery("");
    setHighlight(0);
    // Stay open and focused: adding three drivers is three words, not three
    // trips to the mouse.
    inputRef.current?.focus();
  };

  return (
    <div className="relative print:hidden">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls={listId}
        value={query}
        placeholder={placeholder ?? t.picker.placeholder}
        title={title ?? t.roster.pickerHint}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a hit fires mousedown first, so the list is still there.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        className="w-64 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none disabled:opacity-50"
      />
      {open && query.trim() !== "" && (
        <ul
          id={listId}
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-72 w-72 overflow-auto rounded border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">
              {t.picker.noMatch(query.trim())}
            </li>
          ) : (
            matches.map((d, i) => (
              <li key={d.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(d);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    i === highlight
                      ? "bg-orange-600/20 text-orange-100"
                      : "text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {d.name}
                </button>
              </li>
            ))
          )}
          {options.length > 0 && (
            <li className="border-t border-zinc-800 px-3 pt-1.5 pb-1 text-[11px] text-zinc-600">
              {t.picker.available(options.length)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
