import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCasRatingCached } from "@/lib/cas-rating-data";
import { CR_WINDOW, type CrRaceEntry } from "@/lib/cas-rating";
import { CasRatingCard, CasRatingChart, fmtCr } from "@/components/CasRatingCard";

export const metadata: Metadata = { title: "My CAS Rating" };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left text-xs font-semibold text-zinc-400";
const td = "border-t border-zinc-800 py-2 pr-3 align-top";
const num = "text-right tabular-nums";
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

function raceLabel(e: CrRaceEntry) {
  return `${e.race.leagueName} · R${e.race.roundNumber}${e.race.raceCount > 1 ? ` race ${e.race.raceNumber}` : ""}`;
}

function RaceRows({ rows, windowKeys }: { rows: CrRaceEntry[]; windowKeys?: Set<string> }) {
  return (
    <>
      {rows.map((e) => (
        <tr
          key={e.race.key}
          className={`hover:bg-zinc-900/60 ${windowKeys && !windowKeys.has(e.race.key) ? "text-zinc-500" : ""}`}
        >
          <td className={td}>{fmtDate(e.race.at)}</td>
          <td className={td}>{raceLabel(e)}</td>
          <td className={`${td} ${num}`}>{e.status === "CLASSIFIED" ? `${e.position}/${e.fieldSize}` : e.status}</td>
          <td className={`${td} ${num}`}>
            {e.incidents} / {e.laps}
          </td>
          <td className={`${td} ${num}`}>{fmtCr(e.place)}</td>
          <td className={`${td} ${num}`}>{fmtCr(e.clean)}</td>
          <td className={`${td} ${num}`}>{e.penalty ? `−${e.penalty}` : "–"}</td>
          <td className={`${td} ${num} font-bold ${windowKeys && !windowKeys.has(e.race.key) ? "" : "text-zinc-100"}`}>
            {fmtCr(e.total)}
          </td>
        </tr>
      ))}
    </>
  );
}

function RaceHead() {
  return (
    <thead>
      <tr>
        <th className={th}>Date</th>
        <th className={th}>Race</th>
        <th className={`${th} ${num}`}>Pos.</th>
        <th className={`${th} ${num}`}>Inc / laps</th>
        <th className={`${th} ${num}`}>Place</th>
        <th className={`${th} ${num}`}>Clean</th>
        <th className={`${th} ${num}`}>Penalty</th>
        <th className={`${th} ${num}`}>Points</th>
      </tr>
    </thead>
  );
}

export default async function MyCasRatingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/rating");
  const userId = session.user.id;

  const [user, cr] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, lastName: true, image: true } }),
    getCasRatingCached(prisma),
  ]);
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
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">My CAS Rating</h1>
        <p className="mt-1 text-zinc-400">
          One number from 0 to 100 for every CAS driver, across all leagues: how well, how
          cleanly and how regularly you race with us.
        </p>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[300px_1fr]">
        <CasRatingCard
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
          <h2 className="mb-2 font-semibold text-zinc-100">Rating over time</h2>
          <CasRatingChart points={history} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-500">Performance · 70 %</div>
              <div className="text-xl font-semibold tabular-nums text-zinc-100">{fmtCr(r.performance)}</div>
              <div className="text-xs text-zinc-500">
                Average points of your last {CR_WINDOW} races
                {r.windowRaces.length < CR_WINDOW &&
                  ` (${CR_WINDOW - r.windowRaces.length} still counted as 50)`}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-500">Attendance · 30 %</div>
              <div className="text-xl font-semibold tabular-nums text-zinc-100">{fmtCr(r.attendance)} %</div>
              <div className="text-xs text-zinc-500">Races driven in the leagues you are registered in</div>
            </div>
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-1 font-semibold text-zinc-100">Your last {CR_WINDOW} races</h2>
        <p className="mb-2 text-xs text-zinc-500">
          Place up to 60 (winner 60, last 0; DNF and DSQ 0) + clean up to 40 (−4 per incident per
          10 laps) − steward penalties (category 1 / 2 / 3: −5 / −10 / −20).
        </p>
        {r.windowRaces.length === 0 ? (
          <p className="text-zinc-500">No counted race yet — you start at 50.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <RaceHead />
              <tbody>
                <RaceRows rows={r.windowRaces} />
                {r.adjustments.map((a, i) => (
                  <tr key={`adj${i}`}>
                    <td className={td}>{fmtDate(a.at)}</td>
                    <td className={td} colSpan={5}>
                      {a.reason === "no-show" ? "No-show without declining" : "Steward penalty (no result in that race)"}
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
        <h2 className="mb-2 font-semibold text-zinc-100">Attendance per league</h2>
        {r.leagues.length === 0 ? (
          <p className="text-zinc-500">
            You are not registered in a league that counts right now, so your attendance is 50 %.
          </p>
        ) : (
          <table className="w-full max-w-xl">
            <thead>
              <tr>
                <th className={th}>League</th>
                <th className={`${th} ${num}`}>Driven</th>
                <th className={`${th} ${num}`}>Races held since you registered</th>
              </tr>
            </thead>
            <tbody>
              {r.leagues.map((l) => (
                <tr key={l.leagueSlug}>
                  <td className={td}>{l.leagueName}</td>
                  <td className={`${td} ${num}`}>
                    {l.driven}
                    {l.streamed ? ` (${l.streamed} streamed)` : ""}
                  </td>
                  <td className={`${td} ${num}`}>
                    {l.held}
                    {l.held < CR_WINDOW ? ` of ${CR_WINDOW} (the rest count as half)` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.bonus > 0 && (
          <p className="mt-2 text-xs text-zinc-400">
            Bonus: {r.bonus} extra race{r.bonus === 1 ? "" : "s"} (Fun League, fill-in or official CAS
            stream outside your leagues).
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-semibold text-zinc-100">History</h2>
        <p className="mb-2 text-xs text-zinc-500">
          Every race that counted for your rating. Greyed out: older than your last {CR_WINDOW}.
        </p>
        {all.length === 0 ? (
          <p className="text-zinc-500">No counted race yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <RaceHead />
              <tbody>
                <RaceRows rows={all} windowKeys={windowKeys} />
              </tbody>
            </table>
          </div>
        )}
        {adjustments.length > r.adjustments.length && (
          <p className="mt-2 text-xs text-zinc-500">
            Older deductions no longer counted: {adjustments.length - r.adjustments.length}.
          </p>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Only results published in CLS count. Leagues that count:{" "}
        {countedLeagues.length ? countedLeagues.join(", ") : "none yet — each league joins with its next season"}.
        Updated a few minutes after results or steward decisions are published.{" "}
        <Link href="/profile" className="underline hover:text-zinc-300">
          Profile settings
        </Link>
      </p>
    </div>
  );
}
