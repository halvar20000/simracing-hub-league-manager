"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type SeasonHeroProps = {
  slug: string;
  seasonId: string;
  leagueLogoUrl: string | null;
  leagueName: string;
  seasonName: string;
  seasonYear: number;
  scoringSystemName: string;
  status: string;
  isMulticlass: boolean;
  proAmEnabled: boolean;
  scheduleImageUrl: string | null;
  totalRounds: number;
  completedRounds: number;
  currentLeader: {
    firstName: string | null;
    lastName: string | null;
    startNumber: number | null;
    teamName: string | null;
    points: number;
  } | null;
  nextRound: {
    name: string;
    track: string;
    trackConfig: string | null;
    startsAtIso: string;
  } | null;
  registrationOpen: boolean;
  hasResults: boolean;
};

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

export function SeasonHero(p: SeasonHeroProps) {
  const targetMs = p.nextRound
    ? new Date(p.nextRound.startsAtIso).getTime()
    : null;
  const [countdown, setCountdown] = useState<string>(
    targetMs != null ? formatCountdown(targetMs) : ""
  );

  useEffect(() => {
    if (targetMs == null) return;
    const tick = () => setCountdown(formatCountdown(targetMs));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  const progressPct = Math.round(
    (p.completedRounds / Math.max(1, p.totalRounds)) * 100
  );
  const leaderName = p.currentLeader
    ? `${p.currentLeader.firstName ?? ""} ${p.currentLeader.lastName ?? ""}`.trim()
    : null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800">
      {p.scheduleImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.scheduleImageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/85 via-zinc-950/65 to-zinc-950/90" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-950" />
      )}

      <div className="relative z-10 p-5 sm:p-7">
        {/* League badge */}
        <div className="flex items-center gap-2">
          {p.leagueLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.leagueLogoUrl}
              alt={p.leagueName}
              className="h-7 w-7 shrink-0 object-contain"
            />
          ) : null}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300">
            {p.leagueName}
          </span>
        </div>

        {/* Title */}
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-4xl">
          {p.seasonName}{" "}
          <span className="text-zinc-400">{p.seasonYear}</span>
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          {p.scoringSystemName} • {p.status.replace("_", " ")}
          {p.isMulticlass && " • Multiclass"}
          {p.proAmEnabled && " • Pro/Am"}
        </p>

        {/* Three-card row: progress / leader / next race */}
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {/* Progress */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Progress
            </div>
            <div className="mt-1 font-display text-base font-bold text-zinc-100">
              Round {p.completedRounds} of {p.totalRounds}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-[#ff6b35]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Current Leader */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Current Leader
            </div>
            {p.currentLeader && leaderName ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.currentLeader.startNumber != null && (
                    <span className="mr-1.5 text-[#ff6b35]">
                      #{p.currentLeader.startNumber}
                    </span>
                  )}
                  {leaderName}
                </div>
                <div className="text-xs text-zinc-400">
                  {p.currentLeader.points} pts
                  {p.currentLeader.teamName
                    ? ` • ${p.currentLeader.teamName}`
                    : ""}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-500">
                {p.hasResults ? "—" : "No results yet"}
              </div>
            )}
          </div>

          {/* Next Race */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-3 backdrop-blur-sm">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
              Next Race
            </div>
            {p.nextRound ? (
              <>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  {p.nextRound.track}
                  {p.nextRound.trackConfig
                    ? ` (${p.nextRound.trackConfig})`
                    : ""}
                </div>
                <div className="text-xs text-[#ff6b35]">{countdown}</div>
              </>
            ) : (
              <div className="mt-1 text-sm text-zinc-400">Season complete</div>
            )}
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {p.hasResults && (
            <Link
              href={`/leagues/${p.slug}/seasons/${p.seasonId}/standings`}
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-[#ff8550]"
            >
              Standings →
            </Link>
          )}
          {p.registrationOpen && (
            <Link
              href={`/leagues/${p.slug}/seasons/${p.seasonId}/register`}
              className="rounded border border-[#ff6b35] px-3 py-1.5 text-xs font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
            >
              Register →
            </Link>
          )}
          <Link
            href={`/leagues/${p.slug}/seasons/${p.seasonId}/decisions`}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Decisions →
          </Link>
          {p.scheduleImageUrl && (
            <a
              href={p.scheduleImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Full schedule poster ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
