"use client";

import { useEffect, useRef, useState } from "react";

type UserHit = {
  id: string;
  label: string;
  iracingMemberId: string | null;
};

/**
 * Typeahead picker over existing CLS accounts (/api/users/search).
 *
 * Free text is never submitted: the form value (hidden input `name`) is the
 * selected user's ID, set only when the user picks an entry from the result
 * list. Submitting the surrounding form without a selection is blocked
 * client-side; the server action validates the ID again regardless.
 */
export default function UserSearchPicker({
  name,
  placeholder = "Type a name to search…",
  requiredMessage = "Pick a person from the search results first.",
}: {
  name: string;
  placeholder?: string;
  requiredMessage?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Debounced search.
  useEffect(() => {
    if (selected) return; // input shows the selection; no searching
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as { users: UserHit[] };
          setResults(data.users);
          setOpen(true);
        }
      } catch {
        /* network hiccup — keep silent */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, selected]);

  // Block submitting the surrounding form without a selection.
  useEffect(() => {
    const form = wrapRef.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: Event) => {
      const value = form.querySelector<HTMLInputElement>(
        `input[name="${name}"]`
      )?.value;
      if (!value) {
        e.preventDefault();
        setHint(requiredMessage);
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [name, requiredMessage]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-72">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded border border-cyan-700/60 bg-cyan-950/30 px-2 py-1.5 text-sm">
          <span className="truncate text-cyan-100">
            {selected.label}
            {selected.iracingMemberId && (
              <span className="ml-1 text-xs text-cyan-300/70">
                (iR #{selected.iracingMemberId})
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              setHint(null);
            }}
            className="shrink-0 rounded px-1 text-cyan-300 hover:bg-cyan-900/50"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHint(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
      )}
      {hint && !selected && (
        <p className="mt-1 text-xs text-amber-300">{hint}</p>
      )}
      {open && !selected && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-900 shadow-lg">
          {loading && (
            <li className="px-3 py-2 text-xs text-zinc-500">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-zinc-500">
              No CLS account found. The person must sign in to CLS with
              Discord once.
            </li>
          )}
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(u);
                  setOpen(false);
                  setHint(null);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800"
              >
                <span>{u.label}</span>
                {u.iracingMemberId && (
                  <span className="text-xs text-zinc-500">
                    iR #{u.iracingMemberId}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
