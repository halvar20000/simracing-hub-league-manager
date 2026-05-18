"use client";

import { useEffect, useMemo, useState } from "react";

export interface TrackOption {
  trackName: string;
  configs: string[]; // empty string entry means "no config" (default layout)
}

/**
 * Track + config picker for the Add / Edit round form.
 *
 * - The track is a closed <select> dropdown listing every track in the
 *   IracingTrack cache (sorted alphabetically). The browser supports
 *   type-to-search in native selects.
 * - When a track is selected, the config <select> below it is
 *   populated with that track's variants. The first option is
 *   "(default layout)" which submits an empty trackConfig.
 * - If a round being edited has a track that's no longer in the
 *   catalogue, an extra option for the existing value is added at the
 *   top of the select so the existing value can be preserved.
 *
 * To add a track that isn't in the dropdown, use the "Add a track
 * manually" form on /admin/iracing/tracks first.
 */
export default function TrackSelect({
  tracks,
  defaultTrack = "",
  defaultConfig = "",
  trackInputName = "track",
  configInputName = "trackConfig",
  required = false,
}: {
  tracks: TrackOption[];
  defaultTrack?: string;
  defaultConfig?: string;
  trackInputName?: string;
  configInputName?: string;
  /** kept in props for backwards-compat — no longer used with select UI */
  trackPlaceholder?: string;
  required?: boolean;
}) {
  const [track, setTrack] = useState(defaultTrack);
  const [config, setConfig] = useState(defaultConfig);

  // Sort by name once.
  const sorted = useMemo(
    () =>
      [...tracks].sort((a, b) => a.trackName.localeCompare(b.trackName)),
    [tracks]
  );

  // Match the currently-selected track (case-insensitive).
  const match = useMemo(
    () =>
      sorted.find(
        (t) => t.trackName.toLowerCase() === track.trim().toLowerCase()
      ) ?? null,
    [sorted, track]
  );

  // For Edit-round mode: if defaultTrack isn't in the catalogue, expose
  // it as an extra <option> at the top of the dropdown so it isn't lost
  // when the form is submitted.
  const orphan =
    defaultTrack &&
    !sorted.some(
      (t) => t.trackName.toLowerCase() === defaultTrack.toLowerCase()
    )
      ? defaultTrack
      : null;

  useEffect(() => {
    // When the user picks a different track than the one we have a config
    // for, clear the config so we don't submit a stale variant.
    if (!match) return;
    if (config && !match.configs.includes(config)) {
      setConfig("");
    }
  }, [match, config]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Track {required && <span className="text-orange-400">*</span>}
        </span>
        <select
          name={trackInputName}
          value={track}
          required={required}
          onChange={(e) => setTrack(e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">Select a track…</option>
          {orphan && (
            <option key="__orphan" value={orphan}>
              {orphan} (not in catalogue)
            </option>
          )}
          {sorted.map((t) => (
            <option key={t.trackName} value={t.trackName}>
              {t.trackName}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">
          Type-to-search works in the dropdown. If your track is missing,
          add it on{" "}
          <a
            href="/admin/iracing/tracks"
            className="text-orange-400 hover:underline"
          >
            /admin/iracing/tracks
          </a>{" "}
          first.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Variant / config{" "}
          <span className="text-xs text-zinc-500">
            {match
              ? `(${match.configs.filter(Boolean).length} known)`
              : "(pick a track first)"}
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
          // Track is the orphan (edit-mode legacy value) or nothing is
          // selected yet. Keep the existing config as free text.
          <input
            name={configInputName}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        )}
      </label>
    </div>
  );
}
