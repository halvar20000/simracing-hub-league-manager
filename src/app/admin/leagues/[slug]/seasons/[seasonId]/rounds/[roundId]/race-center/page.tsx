import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  saveRaceCenter,
  uploadRaceCenterReplay,
  uploadRaceCenterChart,
  deleteRaceCenterChart,
  pullWeatherFromIracingJson,
  publishRaceCenter,
  unpublishRaceCenter,
  deleteRaceCenter,
} from "@/lib/actions/race-center";
import { RACE_CENTER_CHART_TYPES, defaultTitleForChartType } from "@/lib/race-center-charts";
import { skiesLabel } from "@/lib/iracing-weather";
import { computeAndSaveDotd, deleteDotd } from "@/lib/actions/driver-of-the-day";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function AdminRaceCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const { ok, error } = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      raceCenter: { include: { charts: { orderBy: { sortOrder: "asc" } } } },
      driverOfTheDay: true,
      raceResults: {
        where: { finishStatus: "CLASSIFIED" },
        orderBy: { finishPosition: "asc" },
        include: {
          registration: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!round || round.season.league.slug !== slug || round.seasonId !== seasonId) {
    notFound();
  }

  const rc = round.raceCenter;
  const dotd = round.driverOfTheDay;
  const dotdRanking = (dotd?.ranking as DotdRankingEntry[] | undefined) ?? [];
  const dotdMetrics = (dotd?.winnerMetrics as DotdWinnerMetrics | undefined) ?? null;
  const dotdClassWinners = (dotd?.classWinners as DotdClassWinner[] | undefined) ?? [];
  const charts = rc?.charts ?? [];
  const chartByType = new Map(charts.map((c) => [c.chartType, c]));

  // Auto-derived previews for the By-the-Numbers cards
  const winner = round.raceResults[0] ?? null;
  const fastestLap = pickFastestLap(round.raceResults);
  const cleanest = pickCleanest(round.raceResults);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to round
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Race Center — R{round.roundNumber} {round.name}
        </h1>
        <p className="text-sm text-zinc-400">
          Curated post-race content shown on the public round page as the{" "}
          <span className="font-mono">?cls=race-center</span> tab. Hidden from the public
          until you click <strong>Publish</strong>.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok.replaceAll("+", " ")}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error.replaceAll("+", " ")}
        </div>
      )}

      {/* === Status + publish controls === */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <div className="text-sm text-zinc-400">Status</div>
          <div className="text-lg font-semibold">
            {rc?.publishedAt ? (
              <span className="text-emerald-400">PUBLISHED</span>
            ) : rc ? (
              <span className="text-amber-400">DRAFT</span>
            ) : (
              <span className="text-zinc-500">EMPTY</span>
            )}
          </div>
          {rc?.publishedAt && (
            <div className="text-xs text-zinc-500">
              Published {rc.publishedAt.toISOString()}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <form action={publishRaceCenter}>
            <input type="hidden" name="leagueSlug" value={slug} />
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="roundId" value={roundId} />
            <button
              type="submit"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-500"
            >
              Publish
            </button>
          </form>
          {rc?.publishedAt && (
            <form action={unpublishRaceCenter}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <button
                type="submit"
                className="rounded border border-amber-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-zinc-800"
              >
                Unpublish
              </button>
            </form>
          )}
          {rc && (
            <form action={deleteRaceCenter}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <button
                type="submit"
                className="rounded border border-red-800 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-zinc-800"
              >
                Delete all
              </button>
            </form>
          )}
        </div>
      </section>

      {/* === Driver of the Day === */}
      <section className="space-y-4 rounded border border-amber-800/40 bg-amber-950/10 p-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-amber-300">
            🏆 Driver of the Day
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Recognition only — no championship points. Upload the iRacing{" "}
            <span className="font-mono">eventresult-XXXX.json</span> (authoritative
            start/finish/incidents) and the race-logger{" "}
            <span className="font-mono">…_race.jsonl</span> (overtakes + recovery). The award
            blends positions gained (40%), overtakes (25%), recovery (20%) and clean racing
            (15%), so it is <strong>not</strong> automatically the race winner. The previous
            round&rsquo;s winner is blocked from a back-to-back win.
          </p>
        </div>

        {dotd ? (
          <div className="space-y-3">
            <div className="rounded border border-amber-700/40 bg-zinc-900 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Winner
              </div>
              <div className="text-lg font-semibold text-zinc-100">
                {dotd.winnerCarNumber ? `#${dotd.winnerCarNumber} ` : ""}
                {dotd.winnerName}
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  score {dotd.score.toFixed(3)}
                </span>
              </div>
              {dotdMetrics && (
                <div className="mt-1 text-xs text-zinc-400">
                  {dotdMetrics.positionsGained >= 0 ? "+" : ""}
                  {dotdMetrics.positionsGained} positions (P{dotdMetrics.startPos}→P
                  {dotdMetrics.finishPos}) · recovered {dotdMetrics.recovery} from P
                  {dotdMetrics.worstPos} · {dotdMetrics.overtakes} overtakes ·{" "}
                  {dotdMetrics.incidents} inc
                </div>
              )}
              {dotd.previousWinnerBlocked && dotd.previousWinnerName && (
                <div className="mt-1 text-xs italic text-cyan-300">
                  No back-to-back: {dotd.previousWinnerName} won the previous round and was
                  blocked here.
                </div>
              )}
            </div>

            {dotdClassWinners.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {dotdClassWinners.map((cw) => (
                  <div
                    key={cw.carClassShortName}
                    className="rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                      {cw.carClassShortName}
                    </span>
                    <div className="text-zinc-200">
                      {cw.winnerCarNumber ? `#${cw.winnerCarNumber} ` : ""}
                      {cw.winnerName}{" "}
                      <span className="text-xs text-zinc-500">{cw.score.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dotdRanking.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="py-1 pr-2">#</th>
                      <th className="py-1 pr-2">Driver</th>
                      <th className="py-1 pr-2 text-right">Gain</th>
                      <th className="py-1 pr-2 text-right">Rec</th>
                      <th className="py-1 pr-2 text-right">OT</th>
                      <th className="py-1 pr-2 text-right">Inc</th>
                      <th className="py-1 pr-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dotdRanking.map((r) => (
                      <tr
                        key={`${r.rank}-${r.name}`}
                        className={`border-t border-zinc-800/60 ${
                          r.rank === 1 && r.eligible ? "text-amber-200" : "text-zinc-300"
                        }`}
                      >
                        <td className="py-1 pr-2">{r.rank}</td>
                        <td className="py-1 pr-2">
                          {r.carNumber ? `#${r.carNumber} ` : ""}
                          {r.name}
                          {r.blockedRepeat ? (
                            <span className="ml-1 text-cyan-400">(prev)</span>
                          ) : !r.eligible ? (
                            <span className="ml-1 text-zinc-600">(x)</span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {r.positionsGained >= 0 ? "+" : ""}
                          {r.positionsGained}
                        </td>
                        <td className="py-1 pr-2 text-right">{r.recovery}</td>
                        <td className="py-1 pr-2 text-right">{r.overtakes}</td>
                        <td className="py-1 pr-2 text-right">{r.incidents}</td>
                        <td className="py-1 pr-2 text-right">{r.score.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1 text-[10px] text-zinc-600">
                  (prev) = blocked from back-to-back · (x) = ineligible (DNF or under distance)
                </div>
              </div>
            )}
            <div className="text-xs text-zinc-500">
              Computed {dotd.computedAt.toISOString()}. Re-upload below to recompute.
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not computed yet.</p>
        )}

        <form
          action={computeAndSaveDotd}
          encType="multipart/form-data"
          className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-3"
        >
          <input type="hidden" name="leagueSlug" value={slug} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="roundId" value={roundId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              eventresult JSON
              <input
                type="file"
                name="eventResult"
                accept="application/json,.json"
                required
                className="mt-1 block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              race-logger log (.jsonl)
              <input
                type="file"
                name="log"
                accept=".jsonl,.json,.ndjson,text/plain,application/json"
                required
                className="mt-1 block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <SubmitWithSpinner
              label={dotd ? "Recompute Driver of the Day" : "Compute Driver of the Day"}
              pendingLabel="Computing…"
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
              spinnerColor="#000"
            />
          </div>
        </form>

        {dotd && (
          <details>
            <summary className="cursor-pointer text-xs text-red-300/80 hover:text-red-200">
              Danger zone
            </summary>
            <form action={deleteDotd} className="mt-2">
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <SubmitWithSpinner
                label="Delete Driver of the Day"
                pendingLabel="Deleting…"
                className="rounded border border-red-800 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-zinc-800"
              />
            </form>
          </details>
        )}
      </section>

      {/* === Auto-derived preview === */}
      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <div className="mb-2 font-semibold text-zinc-200">Auto-derived from results</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            label="Race Winner"
            value={driverName(winner?.registration.user)}
            sub={winner ? `Pos 1 · ${winner.incidents} inc` : "—"}
          />
          <Card
            label="Fastest Lap"
            value={driverName(fastestLap?.registration.user)}
            sub={fastestLap?.bestLapTimeMs ? formatMs(fastestLap.bestLapTimeMs) : "—"}
          />
          <Card
            label="Cleanest Race"
            value={driverName(cleanest?.registration.user)}
            sub={cleanest ? `${cleanest.incidents} incidents` : "—"}
          />
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          These render on the public page automatically; the form below adds optional commentary overlays.
        </div>
      </section>

      {/* === Narrative + cards + conditions === */}
      <form
        action={saveRaceCenter}
        className="space-y-4 rounded border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="leagueSlug" value={slug} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="roundId" value={roundId} />

        <div className="font-semibold text-zinc-200">Narrative</div>

        <Field label="Headline">
          <input
            type="text"
            name="headline"
            defaultValue={rc?.headline ?? ""}
            placeholder="Zörlaut wins late, Wonnenberg's title secured"
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Race Highlights (markdown — multi-paragraph)">
          <textarea
            name="highlightsMd"
            defaultValue={rc?.highlightsMd ?? ""}
            rows={10}
            placeholder={`If Magny-Cours was Wonnenberg's race, **Thruxton was Lukas Zörlaut's**…\n\nBehind him, Speed Monkeys grabbed P2 and P3…`}
            className={`${INPUT_CLASS} font-mono`}
          />
        </Field>

        <hr className="border-zinc-800" />
        <div className="font-semibold text-zinc-200">Curated card commentary (optional)</div>

        <Field label="Winner note (commentary on auto-derived winner)">
          <input type="text" name="winnerNote" defaultValue={rc?.winnerNote ?? ""} className={INPUT_CLASS} />
        </Field>
        <Field label="Fastest Lap note">
          <input type="text" name="fastestLapNote" defaultValue={rc?.fastestLapNote ?? ""} className={INPUT_CLASS} />
        </Field>
        <Field label="Cleanest Race note">
          <input type="text" name="cleanestNote" defaultValue={rc?.cleanestNote ?? ""} className={INPUT_CLASS} />
        </Field>

        <hr className="border-zinc-800" />
        <div className="font-semibold text-zinc-200">Comeback Drive (card is hidden when no driver is selected)</div>

        <Field label="Driver">
          <select name="comebackUserId" defaultValue={rc?.comebackUserId ?? ""} className={INPUT_CLASS}>
            <option value="">— None —</option>
            {round.raceResults.map((r) => (
              <option key={r.registration.user.id} value={r.registration.user.id}>
                {driverName(r.registration.user)} (P{r.finishPosition})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea name="comebackNote" defaultValue={rc?.comebackNote ?? ""} rows={2} className={INPUT_CLASS} />
        </Field>

        <hr className="border-zinc-800" />
        <div className="font-semibold text-zinc-200">Conditions</div>
        <div className="text-xs text-zinc-500">
          Air temp / skies / clouds / precipitation can be pulled from the iRacing eventresult JSON
          using the form below (separate from this Save). Track temp is always manual.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Air temp (°C)">
            <input type="number" step="0.1" name="airTempC" defaultValue={rc?.airTempC ?? ""} className={INPUT_CLASS} />
          </Field>
          <Field label="Track temp (°C)">
            <input type="number" step="0.1" name="trackTempC" defaultValue={rc?.trackTempC ?? ""} className={INPUT_CLASS} />
          </Field>
          <Field label="Skies (0 clear · 1 partly · 2 mostly · 3 overcast)">
            <input type="number" step="1" min="0" max="3" name="skiesCode" defaultValue={rc?.skiesCode ?? ""} className={INPUT_CLASS} />
            {rc?.skiesCode != null && (
              <div className="text-xs text-zinc-500 mt-1">→ {skiesLabel(rc.skiesCode)}</div>
            )}
          </Field>
          <Field label="Cloud cover (%)">
            <input type="number" step="0.1" name="cloudCoverPct" defaultValue={rc?.cloudCoverPct ?? ""} className={INPUT_CLASS} />
          </Field>
          <Field label="Precipitation (mm total)">
            <input type="number" step="0.1" name="precipMm" defaultValue={rc?.precipMm ?? ""} className={INPUT_CLASS} />
          </Field>
          <Field label="Precip time (% of race)">
            <input type="number" step="0.1" name="precipTimePct" defaultValue={rc?.precipTimePct ?? ""} className={INPUT_CLASS} />
          </Field>
        </div>

        <hr className="border-zinc-800" />
        <div className="font-semibold text-zinc-200">Yellow flags</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Count">
            <input type="number" step="1" min="0" name="yellowFlagCount" defaultValue={rc?.yellowFlagCount ?? 0} className={INPUT_CLASS} />
          </Field>
          <Field label="Note">
            <input type="text" name="yellowFlagNote" defaultValue={rc?.yellowFlagNote ?? ""} className={INPUT_CLASS} />
          </Field>
        </div>

        <hr className="border-zinc-800" />
        <div className="font-semibold text-zinc-200">Replay video metadata</div>
        <Field label="Caption">
          <input type="text" name="replayCaption" defaultValue={rc?.replayCaption ?? ""} placeholder="2D telemetry replay — 61 min compressed to 75 s" className={INPUT_CLASS} />
        </Field>
        <Field label="Duration (seconds)">
          <input type="number" step="1" min="0" name="replayDurationS" defaultValue={rc?.replayDurationS ?? ""} className={INPUT_CLASS} />
        </Field>
        <Field label="External broadcast URL (YouTube / Twitch)">
          <input type="url" name="broadcastUrl" defaultValue={rc?.broadcastUrl ?? ""} placeholder="https://youtube.com/…" className={INPUT_CLASS} />
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-500"
          >
            Save
          </button>
        </div>
      </form>

      {/* === Pull weather from iRacing JSON === */}
      <form
        action={pullWeatherFromIracingJson}
        encType="multipart/form-data"
        className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="leagueSlug" value={slug} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="roundId" value={roundId} />
        <div className="font-semibold text-zinc-200">Pull conditions from iRacing JSON</div>
        <p className="text-xs text-zinc-500">
          Upload the same{" "}
          <span className="font-mono">eventresult-XXXXXXXX.json</span> you used for the CSV
          import. Air temp, skies, clouds and precipitation are extracted from{" "}
          <span className="font-mono">session_results[RACE].weather_result</span>. The file is
          not stored — only the values are written to the form fields above.
        </p>
        <input
          type="file"
          name="iracingJson"
          accept="application/json,.json"
          required
          className="block text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
        />
        <button
          type="submit"
          className="rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          Extract &amp; save weather
        </button>
      </form>

      {/* === Replay + poster upload === */}
      <form
        action={uploadRaceCenterReplay}
        encType="multipart/form-data"
        className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="leagueSlug" value={slug} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="roundId" value={roundId} />
        <div className="font-semibold text-zinc-200">Replay video + poster</div>

        <Field label="Replay (MP4 / WebM / MOV — max 200 MB)">
          <input
            type="file"
            name="replay"
            accept="video/mp4,video/webm,video/quicktime"
            className="block text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
          />
          {rc?.replayBlobUrl && (
            <div className="mt-2 text-xs text-zinc-500">
              Current:{" "}
              <a href={rc.replayBlobUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {rc.replayBlobUrl.split("/").pop()}
              </a>
            </div>
          )}
        </Field>

        <Field label="Poster (PNG / JPG / WebP — max 20 MB)">
          <input
            type="file"
            name="poster"
            accept="image/png,image/jpeg,image/webp"
            className="block text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
          />
          {rc?.posterBlobUrl && (
            <div className="mt-2 inline-block overflow-hidden rounded border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rc.posterBlobUrl} alt="Current poster" className="block max-h-32 object-contain" />
            </div>
          )}
        </Field>

        <button
          type="submit"
          className="rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          Upload replay / poster
        </button>
      </form>

      {/* === Charts === */}
      <section className="space-y-4 rounded border border-zinc-800 bg-zinc-900 p-4">
        <div className="font-semibold text-zinc-200">Charts</div>
        <p className="text-xs text-zinc-500">
          Up to 10 chart slots — one per <span className="font-mono">chartType</span>. Uploading to
          a slot that already has an image replaces it.
        </p>

        {RACE_CENTER_CHART_TYPES.map((c) => {
          const existing = chartByType.get(c.type);
          return (
            <form
              key={c.type}
              action={uploadRaceCenterChart}
              encType="multipart/form-data"
              className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/40 p-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <input type="hidden" name="chartType" value={c.type} />

              <div>
                <div className="text-sm font-semibold text-zinc-100">{c.title}</div>
                <div className="text-xs font-mono text-zinc-500">{c.type}</div>
                {existing && (
                  <div className="mt-2 inline-block overflow-hidden rounded border border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={existing.blobUrl} alt={existing.title} className="block max-h-24 object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="file"
                  name="image"
                  accept="image/png,image/jpeg,image/webp"
                  className="block text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
                />
                <input
                  type="text"
                  name="title"
                  defaultValue={existing?.title ?? defaultTitleForChartType(c.type)}
                  className={INPUT_CLASS_SM}
                  placeholder="Card title"
                />
                <textarea
                  name="caption"
                  rows={2}
                  defaultValue={existing?.caption ?? ""}
                  className={`${INPUT_CLASS_SM} resize-y`}
                  placeholder="Caption shown below the chart"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  className="rounded bg-orange-600 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-orange-500"
                >
                  {existing ? "Replace" : "Upload"}
                </button>
                {existing && (
                  <DeleteChartButton
                    slug={slug}
                    seasonId={seasonId}
                    roundId={roundId}
                    chartId={existing.id}
                  />
                )}
              </div>
            </form>
          );
        })}
      </section>
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100";

const INPUT_CLASS_SM =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function DeleteChartButton({
  slug,
  seasonId,
  roundId,
  chartId,
}: {
  slug: string;
  seasonId: string;
  roundId: string;
  chartId: string;
}) {
  return (
    <form action={deleteRaceCenterChart}>
      <input type="hidden" name="leagueSlug" value={slug} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="chartId" value={chartId} />
      <button
        type="submit"
        className="rounded border border-red-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-zinc-800"
      >
        Remove
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// helpers

type ResultUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
};

type ResultRow = {
  finishPosition: number;
  finishStatus: string;
  incidents: number;
  bestLapTimeMs: number | null;
  registration: { user: ResultUser };
};

function pickFastestLap(results: ResultRow[]): ResultRow | null {
  let best: ResultRow | null = null;
  for (const r of results) {
    if (r.bestLapTimeMs == null || r.bestLapTimeMs <= 0) continue;
    if (!best || r.bestLapTimeMs < best.bestLapTimeMs!) best = r;
  }
  return best;
}

function pickCleanest(results: ResultRow[]): ResultRow | null {
  let best: ResultRow | null = null;
  for (const r of results) {
    if (best === null || r.incidents < best.incidents) best = r;
  }
  return best;
}

function driverName(u: ResultUser | null | undefined): string {
  if (!u) return "—";
  const first = u.firstName?.trim() ?? "";
  const last = u.lastName?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full || u.name || "—";
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec - min * 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

// Shapes of the JSON columns on RoundDriverOfTheDay (kept in sync with
// src/lib/actions/driver-of-the-day.ts).
type DotdRankingEntry = {
  rank: number;
  name: string;
  carNumber: string | null;
  carClassShortName: string | null;
  score: number;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
  eligible: boolean;
  blockedRepeat: boolean;
};

type DotdWinnerMetrics = {
  startPos: number | null;
  finishPos: number | null;
  worstPos: number | null;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
};

type DotdClassWinner = {
  carClassShortName: string;
  winnerName: string;
  winnerCarNumber: string | null;
  score: number;
};
