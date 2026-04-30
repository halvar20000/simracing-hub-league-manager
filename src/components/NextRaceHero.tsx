"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function formatCountdown(targetMs: number): string {
  const ms = targetMs - Date.now();
  if (ms <= 0) return "in progress";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `in ${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export function NextRaceHero({
  leagueName,
  leagueLogoUrl,
  leagueSlug,
  seasonId,
  roundId,
  roundName,
  trackName,
  trackConfig,
  startsAtIso,
}: {
  leagueName: string;
  leagueLogoUrl: string | null;
  leagueSlug: string;
  seasonId: string;
  roundId: string;
  roundName: string;
  trackName: string;
  trackConfig: string | null;
  startsAtIso: string;
}) {
  const targetMs = new Date(startsAtIso).getTime();
  const [countdown, setCountdown] = useState<string>(formatCountdown(targetMs));
  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(targetMs));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  return (
    <Link
      href={`/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`}
      className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
    >
      <div className="flex flex-wrap items-center gap-3">
        {leagueLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={leagueLogoUrl}
            alt={leagueName}
            className="h-10 w-10 shrink-0 object-contain"
          />
        )}
        <div className="flex-1 min-w-[10rem]">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Next race · {leagueName}
          </div>
          <div className="mt-0.5 font-display text-lg font-bold text-zinc-100">
            {trackName}
            {trackConfig ? ` (${trackConfig})` : ""}
          </div>
          <div className="text-xs text-zinc-400">{roundName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Starts
          </div>
          <div className="font-display text-xl font-bold text-[#ff6b35]">
            {countdown}
          </div>
        </div>
      </div>
    </Link>
  );
}
