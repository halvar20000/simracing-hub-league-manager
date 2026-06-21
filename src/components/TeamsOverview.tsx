"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CountryFlag } from "@/components/CountryFlag";
import type { TeamGroup } from "@/lib/team-grouping";

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/**
 * Team logo with a graceful fallback: if the image is missing or fails to
 * load (e.g. a broken/blocked external URL), it shows the team initials
 * instead of a broken-image icon.
 */
function TeamLogo({
  logoUrl,
  name,
  size,
}: {
  logoUrl: string | null;
  name: string;
  size: string; // tailwind h-/w- classes, e.g. "h-14 w-14"
}) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`${size} rounded object-contain`}
      />
    );
  }
  return (
    <span
      className={`${size} flex items-center justify-center rounded bg-zinc-800 font-display font-bold text-zinc-300`}
    >
      {initials(name)}
    </span>
  );
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

  // Close on Esc + lock background scroll while the modal is open.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

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
          {filtered.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setSelectedKey(g.key)}
              className="flex flex-col items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <TeamLogo logoUrl={g.logoUrl} name={g.name} size="h-14 w-14 text-lg" />
              <span className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                {g.name}
              </span>
              <span className="text-xs text-zinc-500">
                {g.driverCount} {g.driverCount === 1 ? "driver" : "drivers"}
                {g.seasonCount > 1 && <> · {g.seasonCount} seasons</>}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <TeamModal team={selected} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}

function TeamModal({
  team,
  onClose,
}: {
  team: TeamGroup;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${team.name} drivers`}
    >
      <div
        className="my-auto w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <TeamLogo logoUrl={team.logoUrl} name={team.name} size="h-10 w-10 text-sm" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">{team.name}</h2>
            <p className="text-xs text-zinc-500">
              {team.driverCount}{" "}
              {team.driverCount === 1 ? "driver" : "drivers"} ·{" "}
              {team.leagueNames.join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Close ✕
          </button>
        </header>

        <ul className="max-h-[60vh] divide-y divide-zinc-800 overflow-y-auto">
          {team.drivers.map((d) => (
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
      </div>
    </div>
  );
}
