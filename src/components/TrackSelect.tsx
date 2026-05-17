"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface TrackOption {
  trackName: string;
  configs: string[]; // empty string entry means "no config" (default layout)
}

/**
 * Track + config picker for the Add / Edit round form.
 *
 * - The track input is a typeahead. As you type, up to 8 suggestions
 *   appear below; click one (or press Enter / Tab) to pick.
 * - When a known track is selected, the config <select> below it is
 *   populated with its variants. The first option is always "(default)" /
 *   "(no config)" which submits an empty trackConfig.
 * - If the typed track isn't in the catalogue, the user can still submit
 *   it as free text — no error, just no config suggestions.
 *
 * Server-rendered defaults come from props so editing an existing round
 * works without flash.
 */
export default function TrackSelect({
  tracks,
  defaultTrack = "",
  defaultConfig = "",
  trackInputName = "track",
  configInputName = "trackConfig",
  trackPlaceholder = "Spa-Francorchamps",
  required = false,
}: {
  tracks: TrackOption[];
  defaultTrack?: string;
  defaultConfig?: string;
  trackInputName?: string;
  configInputName?: string;
  trackPlaceholder?: string;
  required?: boolean;
}) {
  const [track, setTrack] = useState(defaultTrack);
  const [config, setConfig] = useState(defaultConfig);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Sort by name once.
  const sorted = useMemo(
    () =>
      [...tracks].sort((a, b) => a.trackName.localeCompare(b.trackName)),
    [tracks]
  );

  // Filter suggestions for the typeahead.
  const suggestions = useMemo(() => {
    const q = track.trim().toLowerCase();
    if (!q) return [];
    return sorted
      .filter((t) => t.trackName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [sorted, track]);

  // Configs to render below: prefer exact match on what's in the input,
  // case-insensitive.
  const match = useMemo(
    () =>
      sorted.find((t) => t.trackName.toLowerCase() === track.trim().toLowerCase()) ??
      null,
    [sorted, track]
  );

  useEffect(() => {
    // When the user picks a different track than the one we have a config
    // for, clear the config so we don't submit a stale variant.
    if (!match) return;
    if (config && !match.configs.includes(config)) {
      setConfig("");
    }
  }, [match, config]);

  // Close suggestion list on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (name: string) => {
    setTrack(name);
    setOpen(false);
    setActiveIdx(0);
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Track {required && <span className="text-orange-400">*</span>}
        </span>
        <div className="relative" ref={wrapRef}>
          <input
            name={trackInputName}
            value={track}
            required={required}
            placeholder={trackPlaceholder}
            autoComplete="off"
            onChange={(e) => {
              setTrack(e.target.value);
              setOpen(true);
              setActiveIdx(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" || e.key === "Tab") {
                const s = suggestions[activeIdx];
                if (s) {
                  e.preventDefault();
                  pick(s.trackName);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          {open && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded border border-zinc-700 bg-zinc-950 shadow-lg">
              {suggestions.map((s, i) => (
                <li key={s.trackName}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(s.trackName);
                    }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${
                      i === activeIdx
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {s.trackName}
                    {s.configs.filter(Boolean).length > 0 && (
                      <span className="ml-2 text-[11px] text-zinc-500">
                        ({s.configs.filter(Boolean).length} variant
                        {s.configs.filter(Boolean).length === 1 ? "" : "s"})
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="mt-1 block text-xs text-zinc-500">
          Start typing — pick a suggestion to auto-fill the variant list
          below. If your track isn&apos;t in the iRacing catalogue you can
          still type it freely.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Variant / config{" "}
          <span className="text-xs text-zinc-500">
            {match
              ? `(${match.configs.filter(Boolean).length} known)`
              : "(free text — track not in catalogue)"}
          </span>
        </span>
        {match ? (
          <select
            name={configInputName}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">(default layout)</option>
            {match.configs
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        ) : (
          <input
            name={configInputName}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder="Grand Prix"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        )}
      </label>
    </div>
  );
}
