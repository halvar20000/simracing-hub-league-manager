import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { loadCasRating, CR_OPEN_LEAGUE_SLUGS } from "@/lib/cas-rating-data";
import { round1, CR_WINDOW, type CrRating } from "@/lib/cas-rating";
import { STREAMERS } from "@/lib/stream-calendar";
import { saveCasRatingConfigAction } from "@/lib/actions/cas-rating";

export const metadata: Metadata = { title: "CAS Rating – Berechnung" };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left text-xs font-semibold text-zinc-400";
const td = "border-t border-zinc-800 py-2 pr-3 align-top";
const num = "text-right tabular-nums";
const fmt = (v: number) => round1(v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

export default async function CasRatingLivePage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string; saved?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const [{ engine, config, names, input }, leagues, staff] = await Promise.all([
    loadCasRating(prisma),
    prisma.league.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      select: {
        slug: true,
        name: true,
        seasons: {
          select: { id: true, name: true, status: true, rounds: { select: { startsAt: true }, orderBy: { startsAt: "asc" }, take: 1 } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "STEWARD"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, firstName: true, lastName: true },
    }),
  ]);

  const now = new Date();
  const ratings: CrRating[] = [...engine.userIds].map((id) => engine.rate(id, now));
  ratings.sort((a, b) => b.rating - a.rating || (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""));
  const detail = sp.driver ? engine.rate(sp.driver, now) : null;
  const delta = sp.driver ? engine.deltaSinceLastRace(sp.driver, now) : null;
  const configured = Object.keys(config.leagues).length > 0;
  const userName = (u: { name: string | null; firstName: string | null; lastName: string | null }) =>
    u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "?";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-sm text-zinc-300">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-100">CAS Rating – Berechnung</h1>
        <Link href="/admin/cas-rating" className="text-[#ff6b35] hover:underline">
          ← Reglement
        </Link>
      </div>
      <p className="text-zinc-400">
        Nur für Admins. Gezählt werden nur veröffentlichte Rennen (Runde auf COMPLETED) der Ligen,
        die unten eine Startsaison haben – diese Saison und alle späteren. Bis zum ersten
        gewerteten Rennen stehen alle bei 50.
      </p>

      {/* ---- settings ---------------------------------------------------- */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Einstellungen</h2>
        {sp.saved && <p className="mb-3 text-emerald-400">Gespeichert.</p>}
        <form action={saveCasRatingConfigAction} className="space-y-4">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Liga</th>
                <th className={th}>Zählt ab Saison</th>
                <th className={th}>Erst ab Datum (optional)</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l) => {
                const c = config.leagues[l.slug];
                const seasons = [...l.seasons].sort(
                  (a, b) => (b.rounds[0]?.startsAt.getTime() ?? Infinity) - (a.rounds[0]?.startsAt.getTime() ?? Infinity)
                );
                return (
                  <tr key={l.slug}>
                    <td className={td}>
                      {l.name}
                      {CR_OPEN_LEAGUE_SLUGS.has(l.slug) && (
                        <div className="text-xs text-zinc-500">Teilnahme nur als Bonus</div>
                      )}
                    </td>
                    <td className={td}>
                      <select
                        name={`season:${l.slug}`}
                        defaultValue={c?.fromSeasonId ?? ""}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      >
                        <option value="">– zählt nicht –</option>
                        {seasons.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.rounds[0] ? ` (ab ${fmtDate(s.rounds[0].startsAt)})` : " (noch keine Runden)"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      <input
                        type="date"
                        name={`from:${l.slug}`}
                        defaultValue={c?.fromDate ?? ""}
                        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div>
            <h3 className="mb-2 font-semibold text-zinc-100">Streamer (Stream-Kalender → CLS-Account)</h3>
            <div className="flex flex-wrap gap-4">
              {STREAMERS.map((name) => (
                <label key={name} className="flex items-center gap-2">
                  {name}
                  <select
                    name={`streamer:${name}`}
                    defaultValue={config.streamers[name] ?? ""}
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                  >
                    <option value="">– nicht zugeordnet –</option>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {userName(u)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <SubmitWithSpinner label="Speichern" />
        </form>
      </section>

      {/* ---- driver detail ----------------------------------------------- */}
      {detail && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-100">{names.get(detail.userId) ?? detail.userId}</h2>
            <Link href="/admin/cas-rating/live" className="text-zinc-400 hover:underline">
              schließen
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <div className="text-3xl font-bold text-[#ff6b35] tabular-nums">{fmt(detail.rating)}</div>
              <div className="text-xs text-zinc-500">
                CR
                {delta != null && Math.abs(delta) >= 0.05 && (
                  <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>
                    {" "}
                    {delta > 0 ? "▲" : "▼"} {fmt(Math.abs(delta))} seit letztem Rennen
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{fmt(detail.performance)}</div>
              <div className="text-xs text-zinc-500">Leistung (70 %)</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{fmt(detail.attendance)} %</div>
              <div className="text-xs text-zinc-500">Teilnahme (30 %)</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{detail.raceCount}</div>
              <div className="text-xs text-zinc-500">Rennen</div>
            </div>
          </div>

          <h3 className="mt-5 mb-1 font-semibold text-zinc-100">
            Letzte {CR_WINDOW} Rennen
            {detail.windowRaces.length < CR_WINDOW &&
              ` (${CR_WINDOW - detail.windowRaces.length}× mit 50 aufgefüllt)`}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Datum</th>
                  <th className={th}>Rennen</th>
                  <th className={`${th} ${num}`}>Platz</th>
                  <th className={`${th} ${num}`}>Inc / Runden</th>
                  <th className={`${th} ${num}`}>Platzpkt.</th>
                  <th className={`${th} ${num}`}>Sauber</th>
                  <th className={`${th} ${num}`}>Strafe</th>
                  <th className={`${th} ${num}`}>Punkte</th>
                </tr>
              </thead>
              <tbody>
                {detail.windowRaces.map((e) => (
                  <tr key={e.race.key} className="hover:bg-zinc-900/60">
                    <td className={td}>{fmtDate(e.race.at)}</td>
                    <td className={td}>
                      {e.race.leagueName} · R{e.race.roundNumber}
                      {e.race.raceCount > 1 ? ` Rennen ${e.race.raceNumber}` : ""}
                    </td>
                    <td className={`${td} ${num}`}>
                      {e.status === "CLASSIFIED" ? `${e.position}/${e.fieldSize}` : e.status}
                    </td>
                    <td className={`${td} ${num}`}>
                      {e.incidents} / {e.laps}
                    </td>
                    <td className={`${td} ${num}`}>{fmt(e.place)}</td>
                    <td className={`${td} ${num}`}>{fmt(e.clean)}</td>
                    <td className={`${td} ${num}`}>{e.penalty ? `−${e.penalty}` : "–"}</td>
                    <td className={`${td} ${num} font-bold text-zinc-100`}>{fmt(e.total)}</td>
                  </tr>
                ))}
                {detail.adjustments.map((a, i) => (
                  <tr key={`adj${i}`}>
                    <td className={td}>{fmtDate(a.at)}</td>
                    <td className={td} colSpan={5}>
                      {a.reason === "no-show" ? "No-show ohne Abmeldung" : "Strafe ohne Ergebnis in diesem Rennen"}
                    </td>
                    <td className={`${td} ${num}`}>−{a.points}</td>
                    <td className={`${td} ${num}`} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 mb-1 font-semibold text-zinc-100">Teilnahme pro Liga</h3>
          {detail.leagues.length === 0 ? (
            <p className="text-zinc-400">In keiner gewerteten Liga aktuell angemeldet → 50 %.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Liga</th>
                  <th className={`${th} ${num}`}>gefahren</th>
                  <th className={`${th} ${num}`}>ausgetragen seit Anmeldung</th>
                  <th className={`${th} ${num}`}>davon gestreamt</th>
                </tr>
              </thead>
              <tbody>
                {detail.leagues.map((l) => (
                  <tr key={l.leagueSlug}>
                    <td className={td}>{l.leagueName}</td>
                    <td className={`${td} ${num}`}>{l.driven}</td>
                    <td className={`${td} ${num}`}>
                      {l.held}
                      {l.held < CR_WINDOW ? ` (+${CR_WINDOW - l.held} halb)` : ""}
                    </td>
                    <td className={`${td} ${num}`}>{l.streamed || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {detail.bonus > 0 && (
            <p className="mt-2 text-zinc-400">
              Bonus: {detail.bonus} Rennen (Fun League, Ersatzfahrer oder Stream außerhalb der
              eigenen Ligen) → +{detail.bonus} gefahren / +{detail.bonus} Rennen.
            </p>
          )}
        </section>
      )}

      {/* ---- ranking ------------------------------------------------------ */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-zinc-100">
          Rangliste ({ratings.length} Fahrer, {input.races.length} gewertete Rennen)
        </h2>
        {!configured ? (
          <p className="text-amber-400">Noch keine Liga eingestellt – oben eine Startsaison wählen.</p>
        ) : ratings.length === 0 ? (
          <p className="text-zinc-400">Noch keine Fahrer in den gewerteten Saisons.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`${th} ${num}`}>#</th>
                  <th className={th}>Fahrer</th>
                  <th className={`${th} ${num}`}>CR</th>
                  <th className={`${th} ${num}`}>Leistung</th>
                  <th className={`${th} ${num}`}>Teilnahme</th>
                  <th className={`${th} ${num}`}>Rennen</th>
                  <th className={th}>Ligen</th>
                </tr>
              </thead>
              <tbody>
                {ratings.map((r, i) => (
                  <tr key={r.userId} className="hover:bg-zinc-900/60">
                    <td className={`${td} ${num}`}>{i + 1}</td>
                    <td className={td}>
                      <Link href={`/admin/cas-rating/live?driver=${r.userId}`} className="hover:underline">
                        {names.get(r.userId) ?? r.userId}
                      </Link>
                    </td>
                    <td className={`${td} ${num} font-bold text-zinc-100`}>{fmt(r.rating)}</td>
                    <td className={`${td} ${num}`}>{fmt(r.performance)}</td>
                    <td className={`${td} ${num}`}>{fmt(r.attendance)} %</td>
                    <td className={`${td} ${num}`}>{r.raceCount}</td>
                    <td className={td}>{r.leagues.map((l) => l.leagueName).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
