"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CountryFlag } from "@/components/CountryFlag";
import type { TeamGroup } from "@/lib/team-grouping";

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export default function TeamsOverview({ groups }: { groups: TeamGroup[] }) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  const selected = useMemo(
    () => groups.find((g) => g.key === selectedKey) ?? null,
    [groups, selectedKey]
  );

  return (
    <div className="space-y-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search teams…"
        className="w-full max-w-sm rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-600"
      />

      {filtered.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No teams match “{query}”.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((g) => {
            const isSel = g.key === selectedKey;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelectedKey(isSel ? null : g.key)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                  isSel
                    ? "border-[#ff6b35] bg-zinc-900 ring-1 ring-[#ff6b35]"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900"
                }`}
              >
                {g.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.logoUrl}
                    alt=""
                    className="h-14 w-14 rounded object-contain"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded bg-zinc-800 font-display text-lg font-bold text-zinc-300">
                    {initials(g.name)}
                  </span>
                )}
                <span className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                  {g.name}
                </span>
                <span className="text-xs text-zinc-500">
                  {g.driverCount}{" "}
                  {g.driverCount === 1 ? "driver" : "drivers"}
                  {g.seasonCount > 1 && <> · {g.seasonCount} seasons</>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60">
          <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
            {selected.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.logoUrl}
                alt=""
                className="h-10 w-10 rounded object-contain"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800 text-sm font-bold text-zinc-300">
                {initials(selected.name)}
              </span>
            )}
            <div className="flex-1">
              <h2 className="font-display text-lg font-bold">
                {selected.name}
              </h2>
              <p className="text-xs text-zinc-500">
                {selected.driverCount}{" "}
                {selected.driverCount === 1 ? "driver" : "drivers"} ·{" "}
                {selected.leagueNames.join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900"
            >
              Close
            </button>
          </header>

          <ul className="divide-y divide-zinc-800">
            {selected.drivers.map((d) => (
              <li
                key={d.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-zinc-900/60"
              >
                <span className="w-9 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
                  {d.startNumber ? `#${d.startNumber}` : ""}
                </span>
                <span className="flex-1 min-w-[10rem] font-medium text-zinc-100">
                  <CountryFlag code={d.countryCode} />
                  {d.iracingMemberId ? (
                    <Link
                      href={`/drivers/${d.iracingMemberId}`}
                      className="hover:text-[#ff6b35] hover:underline"
                    >
                      {d.name}
                    </Link>
                  ) : (
                    d.name
                  )}
                </span>
                <span className="flex flex-wrap gap-1">
                  {d.badges.map((b, i) => (
                    <span
                      key={i}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      title={`${b.leagueName} — ${b.seasonName} ${b.seasonYear}`}
                    >
                      {b.leagueName}{" "}
                      <span className="text-zinc-500">
                        {b.seasonName} {b.seasonYear}
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
