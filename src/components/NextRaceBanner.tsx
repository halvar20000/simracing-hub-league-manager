"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NextRaceBannerData } from "@/lib/next-race-banner";

function countdown(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

/** Slim site-wide strip under the nav: next race + its stream. Hidden only
 *  in the stint planner (a full-width working tool). */
export function NextRaceBanner({ data }: { data: NextRaceBannerData | null }) {
  const pathname = usePathname() ?? "";
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!data || pathname.startsWith("/stint-planner")) return null;

  const start = Date.parse(data.startIso);
  const end = Date.parse(data.endIso);
  const live = now != null && now >= start && now < end;
  const streamLive = !!data.stream && now != null && now >= Date.parse(data.stream.atIso ?? data.startIso) && now < end;

  return (
    <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm sm:px-6">
        <Link href={data.href} className="flex min-w-0 flex-1 items-center gap-2 hover:text-[#ff6b35]">
          {data.leagueLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.leagueLogoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" />
          )}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              live ? "animate-pulse bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {live ? "Live" : "Next race"}
          </span>
          <span className="truncate">
            <span className="font-semibold text-zinc-100">{data.leagueName}</span>
            <span className="text-zinc-500"> · </span>
            <span className="text-zinc-200">{data.track}</span>
            <span className="hidden text-zinc-500 md:inline"> · {data.roundLabel}</span>
          </span>
          <span className="shrink-0 tabular-nums text-zinc-400">
            {data.whenLabel}
            {!live && now != null && start > now && (
              <span className="ml-1.5 font-semibold text-[#ff6b35]">{countdown(start - now)}</span>
            )}
          </span>
        </Link>
        {data.stream && (
          <a
            href={data.stream.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              streamLive
                ? "bg-purple-600 text-white hover:bg-purple-500"
                : "border border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
              <path d="M4.3 2 3 5.4v13.8h4.7V22h2.6l2.6-2.8h3.9l5.2-5.2V2H4.3Zm15.6 11.2-3 3h-4.7l-2.6 2.6v-2.6H5.6V3.8h14.3v9.4ZM16.9 7v5.2h-1.8V7h1.8Zm-4.8 0v5.2h-1.8V7h1.8Z" />
            </svg>
            {streamLive ? "Live on Twitch now" : data.stream.atLabel ? `Live stream ${data.stream.atLabel}` : "Live stream"}
            {data.stream.streamer && <span className="font-normal opacity-80">· {data.stream.streamer}</span>}
          </a>
        )}
      </div>
    </div>
  );
}
