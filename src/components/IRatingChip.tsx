import React from "react";

// iRating tiers — pulled from common iRacing community conventions.
function tierForIRating(value: number): {
  label: string;
  className: string;
} {
  if (value < 1000)
    return { label: "Rookie", className: "bg-zinc-800 text-zinc-300 border-zinc-700" };
  if (value < 2000)
    return { label: "D", className: "bg-amber-950 text-amber-300 border-amber-800/60" };
  if (value < 3000)
    return { label: "C", className: "bg-emerald-950 text-emerald-300 border-emerald-800/60" };
  if (value < 4000)
    return { label: "B", className: "bg-sky-950 text-sky-300 border-sky-800/60" };
  if (value < 5000)
    return { label: "A", className: "bg-violet-950 text-violet-300 border-violet-800/60" };
  return { label: "Pro", className: "bg-yellow-950 text-yellow-300 border-yellow-700/60" };
}

export function IRatingChip({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value == null) return <span className="text-zinc-500">—</span>;
  const t = tierForIRating(value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${t.className} ${className ?? ""}`}
      title={`${value} iRating (${t.label})`}
    >
      <span className="font-semibold">{value}</span>
    </span>
  );
}
