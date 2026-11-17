import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { getCasRatingCached } from "@/lib/cas-rating-data";
import { CR_START, round1 } from "@/lib/cas-rating";
import { fmtCr } from "@/components/CasRatingCard";
import CrLangSwitch from "@/components/CrLangSwitch";
import { getCrLang } from "@/lib/i18n/cas-rating-lang";
import { crHref } from "@/lib/i18n/cas-rating";
import { notIrlmArchive } from "@/lib/irlm-archive";

/**
 * Public CAS Rating ranking: every driver who has ever been approved in a CAS
 * league (everyone starts at 50) plus anyone the engine knows from a counted
 * race or stream. Same cached engine as the badge and /rating.
 */
export const metadata: Metadata = pageMetadata({
  title: "CAS Rating – Ranking",
  description: "The CAS Rating (CR) of every CAS driver, from 0 to 100, as a ranking.",
  url: "/cas-rating/ranking",
});
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left text-xs font-semibold text-zinc-400";
const td = "border-t border-zinc-800 py-2 pr-3 align-middle";
const num = "text-right tabular-nums";

export default async function CasRatingRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { lang: langParam } = await searchParams;
  const [session, cr, drivers, { lang, t }] = await Promise.all([
    auth(),
    getCasRatingCached(prisma),
    prisma.user.findMany({
      where: { registrations: { some: { status: "APPROVED", isTeamManager: false, ...notIrlmArchive } } },
      select: { id: true, name: true, firstName: true, lastName: true, image: true },
    }),
    getCrLang(langParam),
  ]);
  const f = (v: number) => fmtCr(v, lang);
  const me = session?.user?.id ?? null;
  const { engine, config } = cr;
  const now = new Date();

  const people = new Map(
    drivers.map((u) => [
      u.id,
      { name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "?", image: u.image },
    ])
  );
  const missing = [...engine.userIds].filter((id) => !people.has(id));
  if (missing.length) {
    const extra = await prisma.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, firstName: true, lastName: true, image: true },
    });
    for (const u of extra)
      people.set(u.id, {
        name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "?",
        image: u.image,
      });
  }

  const rows = [...people].map(([id, p]) => {
    const r = engine.rate(id, now);
    return {
      id,
      ...p,
      rating: round1(r.rating),
      performance: r.performance,
      attendance: r.attendance,
      races: r.raceCount,
      delta: r.raceCount > 0 ? engine.deltaSinceLastRace(id, now) : null,
    };
  });
  rows.sort(
    (a, b) =>
      b.rating - a.rating ||
      b.races - a.races ||
      a.name.replace(/\[[^\]]*\]\s*/g, "").localeCompare(b.name.replace(/\[[^\]]*\]\s*/g, ""), "de")
  );
  // Equal CR = equal place (1, 2, 2, 4 …).
  let place = 0;
  const ranked = rows.map((r, i) => {
    if (i === 0 || r.rating !== rows[i - 1].rating) place = i + 1;
    return { ...r, place };
  });
  const allAtStart = rows.every((r) => r.races === 0 && r.rating === CR_START);

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-sm text-zinc-300">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-4">
          <img src="/logos/cas-rating-96.png" alt="CAS Rating" width={64} height={64} className="h-16 w-16 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{t.rankTitle}</h1>
            <p className="mt-1 text-zinc-400">{t.rankIntro}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={crHref("/cas-rating", lang)} className="text-[#ff6b35] hover:underline">
            {t.rankRules}
          </Link>
          <CrLangSwitch lang={lang} />
        </div>
      </div>

      {!config.live && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-amber-200">
          <b>{t.preview}</b> {t.previewText}
        </div>
      )}
      {allAtStart && (
        <p className="text-zinc-400">{t.rankAllAtStart}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${th} w-10 ${num}`}>#</th>
              <th className={th}>{t.colDriver}</th>
              <th className={`${th} ${num}`}>CR</th>
              <th className={`${th} ${num} hidden sm:table-cell`}>{t.colLastRace}</th>
              <th className={`${th} ${num} hidden sm:table-cell`}>{t.performance}</th>
              <th className={`${th} ${num} hidden sm:table-cell`}>{t.attendance}</th>
              <th className={`${th} ${num}`}>{t.races}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr
                key={r.id}
                className={r.id === me ? "bg-[#ff6b35]/10" : "hover:bg-zinc-900/60"}
              >
                <td className={`${td} ${num} text-zinc-500`}>{r.place}</td>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-zinc-800" />
                    )}
                    <span className={r.id === me ? "font-semibold text-zinc-100" : ""}>{r.name}</span>
                    {r.id === me && (
                      <Link href={crHref("/rating", lang)} className="text-xs text-[#ff6b35] hover:underline">
                        {t.you}
                      </Link>
                    )}
                  </span>
                </td>
                <td className={`${td} ${num} font-bold text-zinc-100`}>{f(r.rating)}</td>
                <td
                  className={`${td} ${num} hidden sm:table-cell ${
                    r.delta == null || Math.abs(r.delta) < 0.05
                      ? "text-zinc-500"
                      : r.delta > 0
                        ? "text-emerald-400"
                        : "text-red-400"
                  }`}
                >
                  {r.delta == null
                    ? "–"
                    : Math.abs(r.delta) < 0.05
                      ? `± ${f(0)}`
                      : `${r.delta > 0 ? "▲" : "▼"} ${f(Math.abs(r.delta))}`}
                </td>
                <td className={`${td} ${num} hidden sm:table-cell`}>{f(r.performance)}</td>
                <td className={`${td} ${num} hidden sm:table-cell`}>{Math.round(r.attendance)} %</td>
                <td className={`${td} ${num}`}>{r.races}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        {t.rankFooter(ranked.length)} {t.updated}
      </p>
    </div>
  );
}
