"use client";

import { useState } from "react";

export interface SessionOption {
  value: string;
  label: string;
}

export function SessionAndTimestampFields({
  sessionOptions,
}: {
  sessionOptions: SessionOption[];
}) {
  const [outside, setOutside] = useState(false);
  const required = !outside;

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          name="outsideRaceIncident"
          checked={outside}
          onChange={(e) => setOutside(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-orange-500"
        />
        <span>
          <span className="font-medium">Outside race incident</span>
          <span className="ml-1 text-xs text-zinc-500">
            (e.g. chat misconduct, off-track issues — session and timestamp not required)
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Session{required && <span className="ml-1 text-orange-400">*</span>}
          </span>
          <select
            name="session"
            required={required}
            disabled={outside}
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="" disabled>
              Select session…
            </option>
            {sessionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Replay timestamp{required && <span className="ml-1 text-orange-400">*</span>}
          </span>
          <input
            name="replayTimestamp"
            type="text"
            required={required}
            disabled={outside}
            placeholder="e.g. 1:23:45 or 12:30"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Stewards need this to find the incident in the replay.
          </span>
        </label>
      </div>
    </div>
  );
}
