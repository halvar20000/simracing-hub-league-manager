import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/og";
import { getHallOfFame, type HofSeason, type HofStanding } from "@/lib/hall-of-fame";
import { TitleStars } from "@/components/TitleStars";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Hall of Fame",
  description:
    "Every champion of the CAS Community — all leagues, all seasons, from the first GT3 WCT season to today.",
  url: "/hall-of-fame",
});

const pillBase = "rounded-full px-3 py-1 text-sm transition-colors whitespace-nowrap";
const pillOn = "bg-[#ff6b35] text-zinc-950 font-medium";
const pillOff = "tab-off";

const MEDAL = ["", "text-yellow-300", "text-zinc-300", "text-amber-600"];

export default async function HallOfFamePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: leagueParam } = await searchParams;
  const hof = await getHallOfFame();
  const leagueName = new Map(hof.leagues.map((l) => [l.slug, l.name]));
  const shown = leagueParam ? hof.leagues.filter((l) => l.slug === leagueParam) : hof.leagues;
  const topDrivers = hof.drivers.filter((d) => d.titles > 0 || d.classTitles > 0).slice(0, 20);
  const topTeams = hof.teams.slice(0, 10);
  // Only drivers with a CLS profile get a link.
  const ids = topDrivers.map((d) => d.iracingId).filter((x): x is string => !!x);
  const withProfile = new Set(
    (await prisma.user.findMany({ where: { iracingMemberId: { in: ids } }, select: { iracingMemberId: true } }))
      .map((u) => u.iracingMemberId!),
  );
  const short = (slug: string) =>
    (leagueName.get(slug) ?? slug).replace(/^CAS\s+/i, "").replace(/\s+CAS\s+/i, " ");

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="text-yellow-300">🏆</span> Hall of Fame
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Every champion of the CAS Community: {hof.seasonCount} seasons across {hof.leagues.length} leagues.
          Seasons since CLS come straight from the standings; the earlier ones are taken from the old
          iRLM league manager.
        </p>
      </section>

      {!leagueParam && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-yellow-700/30 bg-gradient-to-br from-yellow-950/20 via-zinc-900 to-zinc-950 p-4">
            <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-yellow-300/80">
              Most titles · Drivers
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Driver</th>
                    <th className="py-1 pr-2 text-right" title="Overall championships">Titles</th>
                    <th className="py-1 pr-2 text-right" title="Class championships (Pro, Am, Silver, car classes)">Class</th>
                    <th className="py-1 pr-2 text-right" title="Overall top 3 finishes in a championship">Podiums</th>
                    <th className="hidden py-1 sm:table-cell">Leagues</th>
                  </tr>
                </thead>
                <tbody>
                  {topDrivers.map((d, i) => (
                    <tr key={d.key} className="border-t border-zinc-800">
                      <td className="py-1 pr-2 text-zinc-500">{i + 1}</td>
                      <td className="py-1 pr-2 font-medium text-zinc-100">
                        {d.iracingId && withProfile.has(d.iracingId) ? (
                          <Link href={`/drivers/${d.iracingId}`} className="hover:text-[#ff6b35] hover:underline">
                            {d.name}
                          </Link>
                        ) : (
                          d.name
                        )}
                        <span className="ml-1.5">
                          <TitleStars titles={d.titleList} size="sm" />
                        </span>
                      </td>
                      <td className="py-1 pr-2 text-right font-bold text-yellow-300">{d.titles || "–"}</td>
                      <td className="py-1 pr-2 text-right text-zinc-300">{d.classTitles || "–"}</td>
                      <td className="py-1 pr-2 text-right text-zinc-400">{d.podiums || "–"}</td>
                      <td className="hidden py-1 text-xs text-zinc-500 sm:table-cell">
                        {tally(d.titleLeagues).map(([slug, n]) => `${n > 1 ? `${n}× ` : ""}${short(slug)}`).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-400">
              Most titles · Teams
            </h2>
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {topTeams.map((t, i) => (
                  <tr key={t.key} className="border-t border-zinc-800 first:border-t-0">
                    <td className="py-1 pr-2 text-zinc-500">{i + 1}</td>
                    <td className="py-1 pr-2 font-medium text-zinc-100">{t.name}</td>
                    <td className="py-1 pr-2 text-right font-bold text-yellow-300">{t.titles}</td>
                    <td className="py-1 text-xs text-zinc-500">
                      {tally(t.leagues).map(([slug, n]) => `${n > 1 ? `${n}× ` : ""}${short(slug)}`).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        <Link href="/hall-of-fame" className={`${pillBase} ${!leagueParam ? pillOn : pillOff}`}>
          All leagues
        </Link>
        {hof.leagues.map((l) => (
          <Link
            key={l.slug}
            href={`/hall-of-fame?league=${l.slug}`}
            className={`${pillBase} ${leagueParam === l.slug ? pillOn : pillOff}`}
          >
            {l.name}
          </Link>
        ))}
      </nav>

      {shown.map((l) => (
        <section key={l.slug} className="space-y-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {l.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.logoUrl} alt="" className="h-7 w-7 object-contain" />
            )}
            {l.name}
            <span className="text-xs font-normal text-zinc-500">
              {l.seasons.length} season{l.seasons.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {l.seasons.map((s) => (
              <SeasonCard key={`${s.source}-${s.seasonName}-${s.endedOn}`} s={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function tally(slugs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const s of slugs) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()];
}

function SeasonCard({ s }: { s: HofSeason }) {
  const main = s.standings.find((x) => x.kind === "overall") ?? s.standings[0];
  const rest = s.standings.filter((x) => x !== main);
  const year = s.endedOn.slice(0, 4);
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-yellow-300/80">
          {s.seasonName} · {year}
        </div>
        {s.source === "iRLM" && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500" title="From the old iRLM league manager">
            iRLM
          </span>
        )}
      </div>
      <Podium st={main} />
      {rest.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-zinc-800 pt-2 text-xs">
          {rest.map((st) => {
            const c = st.podium[0];
            return (
              <li key={`${st.kind}-${st.label}`} className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                    {st.kind === "team" && st.label !== "Teams" ? `Team · ${st.label}` : st.label}
                  </span>
                  <span className="truncate text-zinc-200">{c.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">{c.points} pts</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  const cls =
    "block rounded-lg border border-yellow-700/30 bg-gradient-to-br from-yellow-950/25 via-zinc-900 to-zinc-950 p-3";
  return s.href ? (
    <Link href={s.href} className={`${cls} transition-colors hover:border-yellow-500/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Podium({ st }: { st: HofStanding }) {
  const champ = st.podium[0];
  return (
    <div className="mt-1">
      {st.kind !== "overall" && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          {st.kind === "team" ? `Team · ${st.label}` : st.label}
        </div>
      )}
      <div className="font-display text-base font-bold text-zinc-100">🏆 {champ.name}</div>
      <div className="text-xs text-zinc-400 tabular-nums">
        {champ.points} pts{champ.wins > 0 ? ` · ${champ.wins} win${champ.wins === 1 ? "" : "s"}` : ""}
      </div>
      <ol className="mt-1 space-y-0.5 text-xs">
        {st.podium.slice(1).map((e) => (
          <li key={e.pos} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-zinc-300">
              <span className={`mr-1 font-bold ${MEDAL[e.pos] ?? ""}`}>{e.pos}.</span>
              {e.name}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-500">{e.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
