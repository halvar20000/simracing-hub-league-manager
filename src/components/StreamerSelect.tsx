"use client";

import { useState, useTransition } from "react";
import { setStreamerAction } from "@/lib/actions/stream-calendar";
import { STREAMERS, STREAM_VALUES } from "@/lib/stream-calendar";

const COLOR: Record<string, string> = {
  [STREAMERS[0]]: "border-sky-700 bg-sky-950 text-sky-200",
  [STREAMERS[1]]: "border-orange-700 bg-orange-950 text-orange-200",
};

/** Saves on change; the page's counts refresh through revalidatePath. */
export function StreamerSelect({
  streamKey,
  value,
  label,
}: {
  streamKey: string;
  value: string;
  label: string;
}) {
  const [current, setCurrent] = useState(value);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <select
        aria-label={`Streamer for ${label}`}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setCurrent(next);
          setFailed(false);
          startTransition(async () => {
            try {
              await setStreamerAction(streamKey, next);
            } catch {
              setCurrent(value);
              setFailed(true);
            }
          });
        }}
        className={`w-full rounded border px-1.5 py-1 text-xs disabled:opacity-50 ${
          COLOR[current] ?? "border-zinc-700 bg-zinc-900 text-zinc-300"
        }`}
      >
        {STREAM_VALUES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {failed && <p className="mt-0.5 text-[10px] text-red-400">Not saved</p>}
    </>
  );
}
