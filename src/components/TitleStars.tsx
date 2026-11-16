import type { HofTitle } from "@/lib/hall-of-fame";

/**
 * Championship stars, football style: one gold star per overall title, one
 * silver star per class title (Pro/Am, Silver, car class). Hover names the
 * title. Renders nothing without titles.
 */
export function TitleStars({ titles, size = "md" }: { titles: HofTitle[]; size?: "sm" | "md" }) {
  if (titles.length === 0) return null;
  const ordered = [...titles].sort((a, b) => Number(a.kind !== "overall") - Number(b.kind !== "overall"));
  const px = size === "sm" ? "h-3 w-3" : "h-5 w-5";
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5 align-middle" aria-label={starLabel(titles)}>
      {ordered.map((t, i) => (
        <span key={i} title={titleText(t)}>
          <svg
            viewBox="0 0 24 24"
            className={`${px} ${t.kind === "overall" ? "fill-yellow-300 drop-shadow-[0_0_3px_rgba(253,224,71,0.5)]" : "fill-zinc-300"}`}
            aria-hidden
          >
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
          </svg>
        </span>
      ))}
    </span>
  );
}

export function titleText(t: HofTitle): string {
  const what = t.kind === "overall" ? "Champion" : `${t.label} champion`;
  return `${what} · ${t.leagueName} ${t.seasonName} (${t.year})`;
}

function starLabel(titles: HofTitle[]): string {
  const o = titles.filter((t) => t.kind === "overall").length;
  const c = titles.length - o;
  return [o && `${o} championship${o === 1 ? "" : "s"}`, c && `${c} class title${c === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(", ");
}
