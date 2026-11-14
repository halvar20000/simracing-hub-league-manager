import Link from "next/link";
import type { Metadata } from "next";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCasRatingCached } from "@/lib/cas-rating-data";
import { CR_WINDOW, type CrRaceEntry } from "@/lib/cas-rating";
import { CasRatingCard, CasRatingChart, fmtCr } from "@/components/CasRatingCard";
import CrLangSwitch from "@/components/CrLangSwitch";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import FrameAwareSignIn from "@/components/FrameAwareSignIn";
import { getCrLang } from "@/lib/i18n/cas-rating-lang";
import type { CrDict, CrLang } from "@/lib/i18n/cas-rating";

export const metadata: Metadata = { title: "My CAS Rating" };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left text-xs font-semibold text-zinc-400";
const td = "border-t border-zinc-800 py-2 pr-3 align-top";
const num = "text-right tabular-nums";
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

function raceLabel(e: CrRaceEntry, t: CrDict) {
  return `${e.race.leagueName} · R${e.race.roundNumber}${e.race.raceCount > 1 ? ` ${t.raceN(e.race.raceNumber)}` : ""}`;
}

function RaceRows({
  rows,
  windowKeys,
  t,
  lang,
}: {
  rows: CrRaceEntry[];
  windowKeys?: Set<string>;
  t: CrDict;
  lang: CrLang;
}) {
  const f = (v: number) => fmtCr(v, lang);
  return (
    <>
      {rows.map((e) => (
        <tr
          key={e.race.key}
          className={`hover:bg-zinc-900/60 ${windowKeys && !windowKeys.has(e.race.key) ? "text-zinc-500" : ""}`}
        >
          <td className={td}>{fmtDate(e.race.at)}</td>
          <td className={td}>{raceLabel(e, t)}</td>
          <td className={`${td} ${num}`}>{e.status === "CLASSIFIED" ? `${e.position}/${e.fieldSize}` : e.status}</td>
          <td className={`${td} ${num}`}>
            {e.incidents} / {e.laps}
          </td>
          <td className={`${td} ${num}`}>{f(e.place)}</td>
          <td className={`${td} ${num}`}>{f(e.clean)}</td>
          <td className={`${td} ${num}`}>{e.penalty ? `−${e.penalty}` : "–"}</td>
          <td className={`${td} ${num} font-bold ${windowKeys && !windowKeys.has(e.race.key) ? "" : "text-zinc-100"}`}>
            {f(e.total)}
          </td>
        </tr>
      ))}
    </>
  );
}

function RaceHead({ t }: { t: CrDict }) {
  return (
    <thead>
      <tr>
        <th className={th}>{t.colDate}</th>
        <th className={th}>{t.colRace}</th>
        <th className={`${th} ${num}`}>{t.colPos}</th>
        <th className={`${th} ${num}`}>{t.colIncLaps}</th>
        <th className={`${th} ${num}`}>{t.colPlace}</th>
        <th className={`${th} ${num}`}>{t.colClean}</th>
        <th className={`${th} ${num}`}>{t.colPenalty}</th>
        <th className={`${th} ${num}`}>{t.colPoints}</th>
      </tr>
    </thead>
  );
}

/** Logged out: sign in right here (same Discord login as the top bar), then back to /rating. */
async function SignInForRating() {
  const { lang, t } = await getCrLang();
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center text-sm text-zinc-300">
      <div className="flex justify-end">
        <CrLangSwitch lang={lang} />
      </div>
      <h1 className="text-2xl font-bold text-zinc-100">{t.myTitle}</h1>
      <p className="text-zinc-400">{t.signInText}</p>
      <FrameAwareSignIn
        path="/rating"
        label={t.signInNewTab}
        className="inline-block rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
      >
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/rating" });
          }}
        >
          <SubmitWithSpinner label={t.signIn} className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500" />
        </form>
      </FrameAwareSignIn>
      <p>
        <Link href="/cas-rating/ranking" className="text-[#ff6b35] hover:underline">
          {t.rankingAll} →
        </Link>
      </p>
    </div>
  );
}

export default async function MyCasRatingPage() {
  const session = await auth();
  if (!session?.user?.id) return <SignInForRating />;
  const userId = session.user.id;

  const [user, cr, { lang, t }] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, lastName: true, image: true } }),
    getCasRatingCached(prisma),
    getCrLang(),
  ]);
  const f = (v: number) => fmtCr(v, lang);
  const name = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Driver";
  const now = new Date();
  const { engine } = cr;
  const r = engine.rate(userId, now);
  const delta = engine.deltaSinceLastRace(userId, now);
  const history = engine.history(userId, now);
  const all = engine.racesOf(userId, now);
  const adjustments = engine.adjustmentsOf(userId, now);
  const windowKeys = new Set(r.windowRaces.map((e) => e.race.key));
  const countedLeagues = (
    await prisma.league.findMany({
      where: { slug: { in: Object.keys(cr.config.leagues) } },
      select: { name: true },
      orderBy: { name: "asc" },
    })
  ).map((l) => l.name);

  return (
    <div className="mx-auto max-w-5xl space-y-8 text-sm text-zinc-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{t.myTitle}</h1>
          <p className="mt-1 text-zinc-400">{t.myIntro}</p>
        </div>
        <CrLangSwitch lang={lang} />
      </div>

      {!cr.config.live && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-amber-200">
          <b>{t.preview}</b> {t.previewText}
        </div>
      )}

      <div className="grid items-start gap-6 md:grid-cols-[300px_1fr]">
        <CasRatingCard
          lang={lang}
          name={name}
          image={user?.image}
          rating={r.rating}
          delta={delta}
          performance={r.performance}
          attendance={r.attendance}
          races={r.raceCount}
          leagues={all.length ? [...new Set(all.map((e) => e.race.leagueName))] : r.leagues.map((l) => l.leagueName)}
        />
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 font-semibold text-zinc-100">{t.overTime}</h2>
          <CasRatingChart points={history} lang={lang} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-500">{t.performance} · 70 %</div>
              <div className="text-xl font-semibold tabular-nums text-zinc-100">{f(r.performance)}</div>
              <div className="text-xs text-zinc-500">
                {t.perfBox(CR_WINDOW, Math.max(0, CR_WINDOW - r.windowRaces.length))}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-500">{t.attendance} · 30 %</div>
              <div className="text-xl font-semibold tabular-nums text-zinc-100">{f(r.attendance)} %</div>
              <div className="text-xs text-zinc-500">{t.attBox}</div>
            </div>
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-1 font-semibold text-zinc-100">{t.lastRaces(CR_WINDOW)}</h2>
        <p className="mb-2 text-xs text-zinc-500">{t.pointsRule}</p>
        {r.windowRaces.length === 0 ? (
          <p className="text-zinc-500">{t.noCountedRace}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <RaceHead t={t} />
              <tbody>
                <RaceRows rows={r.windowRaces} t={t} lang={lang} />
                {r.adjustments.map((a, i) => (
                  <tr key={`adj${i}`}>
                    <td className={td}>{fmtDate(a.at)}</td>
                    <td className={td} colSpan={5}>
                      {a.reason === "no-show" ? t.noShow : t.penaltyNoResult}
                    </td>
                    <td className={`${td} ${num} text-red-400`}>−{a.points}</td>
                    <td className={td} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-zinc-100">{t.attPerLeague}</h2>
        {r.leagues.length === 0 ? (
          <p className="text-zinc-500">{t.notRegistered}</p>
        ) : (
          <table className="w-full max-w-xl">
            <thead>
              <tr>
                <th className={th}>{t.league}</th>
                <th className={`${th} ${num}`}>{t.driven}</th>
                <th className={`${th} ${num}`}>{t.heldSince}</th>
              </tr>
            </thead>
            <tbody>
              {r.leagues.map((l) => (
                <tr key={l.leagueSlug}>
                  <td className={td}>{l.leagueName}</td>
                  <td className={`${td} ${num}`}>
                    {l.driven}
                    {l.streamed ? ` ${t.streamed(l.streamed)}` : ""}
                  </td>
                  <td className={`${td} ${num}`}>
                    {l.held}
                    {l.held < CR_WINDOW ? ` ${t.restHalf(CR_WINDOW)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.bonus > 0 && <p className="mt-2 text-xs text-zinc-400">{t.bonus(r.bonus)}</p>}
      </section>

      <section>
        <h2 className="mb-1 font-semibold text-zinc-100">{t.history}</h2>
        <p className="mb-2 text-xs text-zinc-500">{t.historyIntro(CR_WINDOW)}</p>
        {all.length === 0 ? (
          <p className="text-zinc-500">{t.noCountedRaceShort}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <RaceHead t={t} />
              <tbody>
                <RaceRows rows={all} windowKeys={windowKeys} t={t} lang={lang} />
              </tbody>
            </table>
          </div>
        )}
        {adjustments.length > r.adjustments.length && (
          <p className="mt-2 text-xs text-zinc-500">
            {t.olderDeductions(adjustments.length - r.adjustments.length)}
          </p>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        {t.onlyPublished} {countedLeagues.length ? countedLeagues.join(", ") : t.noLeagueYet}. {t.updated}{" "}
        <Link href="/cas-rating" className="underline hover:text-zinc-300">
          {t.howItWorks}
        </Link>{" "}
        ·{" "}
        <Link href="/cas-rating/ranking" className="underline hover:text-zinc-300">
          {t.rankingAll}
        </Link>{" "}
        ·{" "}
        <Link href="/profile" className="underline hover:text-zinc-300">
          {t.profileSettings}
        </Link>
      </p>
    </div>
  );
}
