import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicLeaguesList() {
  const now = new Date();
  const candidateRounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      season: {
        scoringSystem: {
          protestCooldownHours: { not: null },
          protestWindowHours: { not: null },
        },
      },
    },
    include: {
      season: { include: { league: true, scoringSystem: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  const recentRounds = candidateRounds.filter((r) => {
    const cd = r.season.scoringSystem?.protestCooldownHours;
    const wn = r.season.scoringSystem?.protestWindowHours;
    if (cd == null || wn == null) return false;
    const opensAt = new Date(r.startsAt.getTime() + cd * 3600 * 1000);
    const closesAt = new Date(opensAt.getTime() + wn * 3600 * 1000);
    return now >= opensAt && now < closesAt;
  });

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });

  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { seasons: true } },
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      {recentRounds.length > 0 && (
        <section className="rounded border border-amber-700/50 bg-amber-950/20 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">⚑</span>
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-amber-200">
              Open for incident reporting
            </h2>
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            Recently-completed rounds. Click to file a steward report.
          </p>
          <ul className="space-y-1">
            {recentRounds.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded bg-zinc-900/60 px-3 py-1.5 text-sm"
              >
                <span className="text-zinc-500">{fmtDate(r.startsAt)}</span>
                <span className="text-zinc-400">
                  {r.season.league.name} · {r.season.name} {r.season.year}
                </span>
                <span className="font-medium text-zinc-200">
                  R{r.roundNumber} {r.name}
                </span>
                <Link
                  href={`/leagues/${r.season.league.slug}/seasons/${r.seasonId}/rounds/${r.id}/report`}
                  className="ml-auto rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-500"
                >
                  Report incident →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-1 font-display text-lg font-bold tracking-wide">
          Leagues
        </h1>
      </div>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="group flex flex-col items-center gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              title={league.name}
            >
              {league.logoUrl ? (
                <img
                  src={league.logoUrl}
                  alt={league.name}
                  className="h-9 w-full object-contain"
                />
              ) : (
                <div className="h-9 w-full rounded bg-zinc-800" />
              )}
              <div className="w-full">
                <div className="truncate font-display text-[10px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
                  {league.name}
                </div>
                <div className="truncate text-[9px] text-zinc-500">
                  {league._count.seasons} season
                  {league._count.seasons === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
