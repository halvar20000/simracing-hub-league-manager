/**
 * Small inline "Garage 61" link badge. Renders nothing if url is null /
 * empty so callers can drop it in unconditionally:
 *
 *   <Garage61Link url={user.garage61Url} />
 *
 * Two visual variants:
 *  - "badge" (default): compact pill, used inline next to a driver name
 *    in a roster row.
 *  - "button": larger, used on header / season page next to other top-
 *    level links (Twitch, Discord, etc.).
 */
export default function Garage61Link({
  url,
  variant = "badge",
  label,
}: {
  url?: string | null;
  variant?: "badge" | "button";
  label?: string;
}) {
  if (!url || !url.trim()) return null;

  const text = label ?? (variant === "button" ? "Garage 61 team" : "G61");
  const title = label ?? "Open in Garage 61";

  if (variant === "button") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
      >
        {text} →
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="ml-1 inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-700"
    >
      {text}
    </a>
  );
}
