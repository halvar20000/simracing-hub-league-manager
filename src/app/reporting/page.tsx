import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { protestWindowState, formatCountdown } from "@/lib/protest-window";
import { liveSeasonWhere } from "@/lib/season-visibility";

export const metadata: Metadata = pageMetadata({
  title: "Open for incident reporting",
  description:
    "Rounds currently within the steward reporting window across all CAS leagues. Share this link to let drivers file reports.",
  url: "/reporting",
});

// Always re-evaluate on each visit — the window is time-based.
export const dynamic = "force-dynamic";

export default async function PublicReportingPage() {
  const now = new Date();

  // Pull a generous slice of recent rounds across every league that has a
  // protest window configured. We then filter to OPEN / COOLDOWN states in JS
  // because the window math is non-trivial and matches /lib/protest-window.
  const candidateRounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      season: {
        ...liveSeasonWhere,
        scoringSystem: {
          incidentReportingEnabled: true,
          protestCooldownHours: { not: null },
          protestWindowHours: { not: null },
        },
      },
    },
    include: {
      season: { include: { league: true, scoringSystem: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  type OpenRow = {
    id: string;
    seasonId: string;
    roundNumber: number;
    name: string;
    startsAt: Date;
    leagueName: string;
    leagueSlug: string;
    seasonName: string;
    seasonYear: number;
    closesAt: Date | null;
    minutesRemaining: number | null;
  };
  type ComingSoonRow = OpenRow & { opensAt: Date; minutesUntilOpen: number };

  const open: OpenRow[] = [];
  const comingSoon: ComingSoonRow[] = [];

  for (const r of candidateRounds) {
    const state = protestWindowState({
      raceStartsAt: r.startsAt,
      protestCooldownHours: r.season.scoringSystem.protestCooldownHours,
      protestWindowHours: r.season.scoringSystem.protestWindowHours,
      now,
    });
    const base: OpenRow = {
      id: r.id,
      seasonId: r.seasonId,
      roundNumber: r.roundNumber,
      name: r.name,
      startsAt: r.startsAt,
      leagueName: r.season.league.name,
      leagueSlug: r.season.league.slug,
      seasonName: r.season.name,
      seasonYear: r.season.year,
      closesAt: state.closesAt,
      minutesRemaining: state.minutesRemaining,
    };
    if (state.status === "OPEN" || state.status === "UNLIMITED") {
      open.push(base);
    } else if (state.status === "COOLDOWN" && state.opensAt && state.minutesUntilOpen != null && state.minutesUntilOpen < 48 * 60) {
      // Surface upcoming windows that will open within the next 48h, so the
      // page is still useful when nothing is live right now.
      comingSoon.push({
        ...base,
        opensAt: state.opensAt,
        minutesUntilOpen: state.minutesUntilOpen,
      });
    }
  }

  open.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  comingSoon.sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const fmtDateTime = (d: Date) =>
    d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leagues"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Leagues
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">
          Incident reporting
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pick the round you want to file a steward report for. Each league
          has its own reporting window after a race finishes.
        </p>
      </div>

      <section className="rounded border border-amber-700/50 bg-amber-950/20 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-base">⚑</span>
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-amber-200">
            Open right now ({open.length})
          </h2>
        </div>
        {open.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nothing is open for reporting at the moment. The reporting window
            opens a few hours after each race finishes and stays open for a
            limited time. Check back after the next race.
          </p>
        ) : (
          <ul className="space-y-1">
            {open.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded bg-zinc-900/60 px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-500">{fmtDate(r.startsAt)}</span>
                <span className="text-zinc-400">
                  {r.leagueName} · {r.seasonName} {r.seasonYear}
                </span>
                <span className="font-medium text-zinc-200">
                  R{r.roundNumber} {r.name}
                </span>
                {r.minutesRemaining != null && (
                  <span className="text-xs text-amber-300">
                    closes in {formatCountdown(r.minutesRemaining)}
                  </span>
                )}
                <Link
                  href={`/leagues/${r.leagueSlug}/seasons/${r.seasonId}/rounds/${r.id}/report`}
                  className="ml-auto rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-500"
                >
                  Report incident →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {comingSoon.length > 0 && (
        <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">⏳</span>
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
              Opens within 48h ({comingSoon.length})
            </h2>
          </div>
          <ul className="space-y-1">
            {comingSoon.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded bg-zinc-950/60 px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-500">{fmtDate(r.startsAt)}</span>
                <span className="text-zinc-400">
                  {r.leagueName} · {r.seasonName} {r.seasonYear}
                </span>
                <span className="font-medium text-zinc-200">
                  R{r.roundNumber} {r.name}
                </span>
                <span className="ml-auto text-xs text-zinc-400">
                  opens {fmtDateTime(r.opensAt)} (in {formatCountdown(r.minutesUntilOpen)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-400">
        <p>
          Looking for past decisions instead?{" "}
          <Link
            href="/incidents"
            className="text-orange-400 hover:underline"
          >
            See all incident reports →
          </Link>
        </p>
      </section>
    </div>
  );
}
