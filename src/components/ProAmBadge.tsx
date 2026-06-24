/**
 * Pro/Am tier badge — single source of truth for the Pro/Am colors used in
 * the standings, round results, qualifying and roster tables.
 * Pro = sky, Am = amber.
 */
export function ProAmBadge({ cls }: { cls: "PRO" | "AM" | null }) {
  if (!cls) return <span className="text-zinc-600">—</span>;
  const isPro = cls === "PRO";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isPro ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {isPro ? "Pro" : "Am"}
    </span>
  );
}
