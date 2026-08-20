import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { upsertRaceResult, recomputeRoundScoringAction } from "@/lib/actions/race-results";
import { formatMsToTime } from "@/lib/time";
import { CountryFlag } from "@/components/CountryFlag";
import { pullResultsFromIRLM } from "@/lib/actions/irlm-import";
import { PullFromIRLMButton } from "@/components/PullFromIRLMButton";
import { setRoundPublished } from "@/lib/actions/rounds";
import { createRaceEventAction } from "@/lib/actions/race-events";
import {
  matchYoutubeAction,
  setRoundYoutubeAction,
  matchTwitchAction,
  setRoundTwitchAction,
} from "@/lib/actions/race-videos";
import { isExpiringVodType, twitchVideoUrl } from "@/lib/twitch";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { formatDateTime } from "@/lib/date";
import { compareStartNumber } from "@/lib/start-number";

export default async function AdminRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{
    imported?: string;
    skipped?: string;
    cls?: string;
    published?: string;
    unpublished?: string;
    event?: string;
    eventDetail?: string;
    yt?: string;
    ytDetail?: string;
    tw?: string;
    twDetail?: string;
  }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const { imported, skipped, cls: clsRaw, published, unpublished, event, eventDetail, yt, ytDetail, tw, twDetail } =
    await searchParams;
  type Cls = "combined" | "pro" | "am" | "team";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :
    clsRaw === "am" ? "am" :
    clsRaw === "team" ? "team" : "combined";
  const baseHref = `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: { league: true, scoringSystem: true },
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      raceResults: { where: { roundId } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  registrations.sort((a, b) =>
    compareStartNumber(a.startNumber, b.startNumber)
  );

  // Publish state: results go public only when the round is COMPLETED.
  const isPublished = round.status === "COMPLETED";
  const teamResultCount = await prisma.teamResult.count({ where: { roundId } });
  const hasResults =
    registrations.some((r) => r.raceResults.length > 0) || teamResultCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {round.season.name} {round.season.year}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Round {round.roundNumber} — {round.name}
            </h1>
            <p className="text-sm text-zinc-400">
              {round.track}
              {round.trackConfig ? ` (${round.trackConfig})` : ""} •{" "}
              {formatDateTime(round.startsAt)} •{" "}
              {round.status.replace("_", " ")}
              {isPublished ? (
                <span className="ml-2 rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Public
                </span>
              ) : (
                <span className="ml-2 rounded bg-orange-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                  Not published
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPublished ? (
              <form action={setRoundPublished}>
                <input type="hidden" name="leagueSlug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <input type="hidden" name="publish" value="0" />
                <SubmitWithSpinner
                  label="Unpublish"
                  pendingLabel="Unpublishing…"
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                />
              </form>
            ) : (
              <form action={setRoundPublished}>
                <input type="hidden" name="leagueSlug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <input type="hidden" name="publish" value="1" />
                <SubmitWithSpinner
                  label="✓ Publish results"
                  pendingLabel="Publishing…"
                  disabled={!hasResults}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                />
              </form>
            )}
            {round.irlmEventId && round.season.irlmLeagueName && (
              <form action={pullResultsFromIRLM}>
                <input type="hidden" name="leagueSlug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <PullFromIRLMButton />
              </form>
            )}
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/import`}
              className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Import CSV
            </Link>
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/import-json`}
              className="rounded border border-orange-500 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
            >
              Import iRacing JSON
            </Link>
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/rsvp`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              RSVP
            </Link>
            <form action={recomputeRoundScoringAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <SubmitWithSpinner
                label="♻️ Recompute scoring"
                pendingLabel="Recomputing…"
                className="rounded border border-cyan-700/60 bg-cyan-950/30 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-900/40"
              />
            </form>
            {round.season.league.discordGuildId && (
              <form action={createRaceEventAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <SubmitWithSpinner
                  label="📅 Discord event"
                  pendingLabel="Creating…"
                  className="rounded border border-indigo-700/60 bg-indigo-950/30 px-3 py-1.5 text-sm text-indigo-200 hover:bg-indigo-900/40"
                />
              </form>
            )}
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/stream`}
              className="rounded border border-purple-700/60 bg-purple-950/30 px-3 py-1.5 text-sm text-purple-200 hover:bg-purple-900/40"
            >
              📡 Stream announcement
            </Link>
            {round.season.league.youtubeChannelId && (
              <form action={matchYoutubeAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <SubmitWithSpinner
                  label="📺 Match YouTube"
                  pendingLabel="Searching…"
                  className="rounded border border-red-700/60 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
                />
              </form>
            )}
            {round.season.league.twitchChannelLogin && (
              <form action={matchTwitchAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <SubmitWithSpinner
                  label="🟣 Match Twitch"
                  pendingLabel="Searching…"
                  className="rounded border border-purple-700/60 bg-purple-950/30 px-3 py-1.5 text-sm text-purple-200 hover:bg-purple-900/40"
                />
              </form>
            )}
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/race-center`}
              className="rounded border border-red-700/60 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
            >
              📝 Race Center
            </Link>
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
              className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
            >
              👁 Preview public
            </Link>
            {round.season.scoringSystem.incidentReportingEnabled && (
              <>
                {/* Stewards open a case straight from the round they are
                    looking at — the form itself is the public one, which
                    lets a steward file for the league and ignores the
                    protest window. */}
                <Link
                  href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/report`}
                  className="rounded border border-amber-600/60 bg-amber-950/30 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-900/40"
                >
                  ⚑ Report as league
                </Link>
                <Link
                  href={`/admin/leagues/${slug}/seasons/${seasonId}/reports`}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  ⚖️ Reports
                </Link>
              </>
            )}
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/edit`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Edit round
            </Link>
          </div>
        </div>
      </div>

      {imported && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Imported {imported} row{imported === "1" ? "" : "s"}
          {skipped && Number(skipped) > 0
            ? `, skipped ${skipped} (likely no matching iRacing ID in roster)`
            : ""}
          .
        </div>
      )}

      {published && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          ✓ Results published — they are now live on the public round page and
          counted in the standings.
        </div>
      )}
      {unpublished && (
        <div className="rounded border border-orange-800 bg-orange-950 p-3 text-sm text-orange-200">
          Results unpublished — they are hidden from the public again (admin
          preview only) and removed from the public standings.
        </div>
      )}

      {event && (
        event.startsWith("failed") ? (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            <p>
              Could not create the Discord event ({event.replace("failed:", "")}).
              Check that the bot is in the server with the “Manage Events”
              permission and the league’s Discord server ID is set.
            </p>
            {eventDetail && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-red-950/60 p-2 text-xs text-red-300">
                {eventDetail}
              </pre>
            )}
          </div>
        ) : (
          <div className="rounded border border-indigo-800 bg-indigo-950 p-3 text-sm text-indigo-200">
            Discord race event {event === "updated" ? "updated" : "created"} — it
            now shows in the server’s Events tab and members get the start
            reminder ~15 min before.
          </div>
        )
      )}

      {yt && (
        yt.startsWith("failed") ? (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            <p>
              {yt === "failed:no-candidate"
                ? "No stream video found in the time window around this race. The VOD may not be up yet — try again later, or paste the link manually below."
                : yt === "failed:not-configured"
                  ? "This league has no YouTube channel set. Add it on the league edit page."
                  : yt === "failed:no-key"
                    ? "YOUTUBE_API_KEY is not set in the environment."
                    : yt === "failed:channel-not-found"
                      ? "Could not resolve the league's YouTube channel — check the @handle / channel ID on the league edit page."
                      : yt === "failed:bad-url"
                        ? "That doesn't look like a YouTube URL or video ID."
                        : `Could not match a YouTube video (${yt.replace("failed:", "")}).`}
            </p>
            {ytDetail && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-red-950/60 p-2 text-xs text-red-300">
                {ytDetail}
              </pre>
            )}
          </div>
        ) : (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            {yt === "cleared"
              ? "Stream video cleared."
              : yt === "yt-unchanged"
                ? "Already linked to the best-matching video — no change."
                : "Stream video linked — it now embeds on the public round page."}
          </div>
        )
      )}

      {tw && (
        tw.startsWith("failed") ? (
          <div className="rounded border border-purple-800 bg-purple-950 p-3 text-sm text-purple-200">
            <p>
              {tw === "failed:no-candidate"
                ? "No Twitch broadcast found in the window around this race (3h before to 6h after the start). Twitch also deletes past broadcasts after a few weeks — if the race is older than that, the VOD is gone."
                : tw === "failed:not-configured"
                  ? "This league has no Twitch channel set. Add it on the league edit page."
                  : tw === "failed:no-key"
                    ? "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set in the environment."
                    : tw === "failed:channel-not-found"
                      ? "Could not resolve the league's Twitch channel — check the channel name on the league edit page."
                      : tw === "failed:bad-url"
                        ? "That doesn't look like a Twitch VOD URL or id (expected twitch.tv/videos/123456789)."
                        : `Could not match a Twitch VOD (${tw.replace("failed:", "")}).`}
            </p>
            {twDetail && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-purple-950/60 p-2 text-xs text-purple-300">
                {twDetail}
              </pre>
            )}
          </div>
        ) : (
          <div className="rounded border border-purple-800 bg-purple-950 p-3 text-sm text-purple-200">
            {tw === "cleared"
              ? "Twitch VOD cleared."
              : tw === "tw-unchanged"
                ? "Already linked to the best-matching VOD — no change."
                : "Twitch VOD linked — it now embeds on the public round page."}
          </div>
        )
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">📺 Stream video</h2>
        {round.youtubeVideoId ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a
              href={`https://www.youtube.com/watch?v=${round.youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/stream-thumb?yt=${round.youtubeVideoId}`}
                alt="Stream thumbnail"
                className="h-16 w-28 rounded object-cover"
              />
            </a>
            <span className="text-xs text-zinc-400">
              Linked video{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5">
                {round.youtubeVideoId}
              </code>
              {round.youtubeMatchedAt && (
                <span className="ml-1 text-zinc-500">
                  · {formatDateTime(round.youtubeMatchedAt)}
                </span>
              )}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            No stream video linked yet.
            {round.season.league.youtubeChannelId
              ? " Use “📺 Match YouTube” above to auto-find it, or paste a link below."
              : " Set the league's YouTube channel to enable auto-matching, or paste a link below."}
          </p>
        )}
        <form action={setRoundYoutubeAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="roundId" value={roundId} />
          <label className="block flex-1 min-w-[16rem]">
            <span className="mb-1 block text-xs text-zinc-400">
              Paste YouTube URL or video ID (leave empty + save to clear)
            </span>
            <input
              name="youtubeUrl"
              type="text"
              defaultValue=""
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <SubmitWithSpinner
            label="Save"
            pendingLabel="Saving…"
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          />
        </form>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">🟣 Twitch VOD</h2>
        {round.twitchVideoId ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a
              href={twitchVideoUrl(round.twitchVideoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              {round.twitchThumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={round.twitchThumbnailUrl}
                  alt=""
                  className="h-16 w-28 rounded bg-purple-950 object-cover"
                />
              ) : (
                <span className="flex h-16 w-28 items-center justify-center rounded bg-purple-950 text-xs text-purple-300">
                  Twitch
                </span>
              )}
            </a>
            <span className="text-xs text-zinc-400">
              Linked VOD{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5">
                {round.twitchVideoId}
              </code>
              {round.twitchVideoType && (
                <span className="ml-1 text-zinc-500">
                  · {round.twitchVideoType}
                </span>
              )}
              {round.twitchMatchedAt && (
                <span className="ml-1 text-zinc-500">
                  · {formatDateTime(round.twitchMatchedAt)}
                </span>
              )}
              {isExpiringVodType(round.twitchVideoType) && (
                <span className="mt-1 block text-amber-300/80">
                  ⚠ Past broadcast — Twitch deletes these after 7-60 days. Ask
                  the streamer to save it as a Highlight to keep it permanently.
                </span>
              )}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            No Twitch VOD linked yet.
            {round.season.league.twitchChannelLogin
              ? " Use “🟣 Match Twitch” above to auto-find it, or paste a link below."
              : " Set the league's Twitch channel to enable auto-matching, or paste a link below."}
          </p>
        )}
        <form action={setRoundTwitchAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="roundId" value={roundId} />
          <label className="block flex-1 min-w-[16rem]">
            <span className="mb-1 block text-xs text-zinc-400">
              Paste Twitch VOD URL or id (leave empty + save to clear)
            </span>
            <input
              name="twitchUrl"
              type="text"
              defaultValue=""
              placeholder="https://www.twitch.tv/videos/2838058556"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <SubmitWithSpinner
            label="Save"
            pendingLabel="Saving…"
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          />
        </form>
      </section>

      {!isPublished && (
        <div className="rounded border border-orange-500/40 bg-orange-500/5 p-3 text-sm text-orange-200/90">
          {hasResults
            ? "Results are imported but not yet public. Preview them, then click “✓ Publish results” to make them live and update the standings."
            : "Import the race results first, then a “✓ Publish results” button will appear here to make them public."}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Scoring:{" "}
          <strong className="text-zinc-200">
            {round.season.scoringSystem.name}
          </strong>
          {" • "}
          Participation: {round.season.scoringSystem.participationPoints}{" "}
          points if ≥ {round.season.scoringSystem.participationMinDistancePct}%
          of race distance.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Points are recalculated automatically after each save or CSV import.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        <Link
          href={baseHref}
          className={`rounded px-3 py-1.5 ${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
        >
          Combined
        </Link>
        {round.season.isMulticlass && (
          <>
            <Link
              href={`${baseHref}?cls=pro`}
              className={`rounded px-3 py-1.5 ${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              Pro
            </Link>
            <Link
              href={`${baseHref}?cls=am`}
              className={`rounded px-3 py-1.5 ${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              Am
            </Link>
          </>
        )}
        <Link
          href={`${baseHref}?cls=team`}
          className={`rounded px-3 py-1.5 ${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
        >
          Team
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Results — {registrations.length} approved driver
          {registrations.length === 1 ? "" : "s"}
        </h2>

        {registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No approved drivers yet. Approve registrations on the Roster tab
            first.
          </p>
        ) : (
          <AdminRegList
            registrations={registrations}
            cls={cls}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            isMulticlass={round.season.isMulticlass}
            participationInCombined={
              round.season.scoringSystem.participationInCombined ?? true
            }
          />
        )}
      </section>
    </div>
  );
}

function ResultRow({
  slug,
  seasonId,
  roundId,
  reg,
  isMulticlass,
  includeParticipation = true,
}: {
  slug: string;
  seasonId: string;
  roundId: string;
  /** When false, the displayed total excludes participation (matches the
   * standings combinedTotal for seasons with participationInCombined off). */
  includeParticipation?: boolean;
  reg: {
    id: string;
    startNumber: string | null;
    user: { firstName: string | null; lastName: string | null; countryCode: string | null };
    team: { name: string } | null;
    carClass: { name: string; shortCode: string } | null;
    proAmClass: "PRO" | "AM" | null;
      excludedAt: Date | null;
      retiredAt: Date | null;
    raceResults: Array<{
      id: string;
      finishPosition: number;
      lapsCompleted: number;
      raceDistancePct: number;
      totalTimeMs: number | null;
      bestLapTimeMs: number | null;
      incidents: number;
      startPosition: number | null;
      qualifyingTimeMs: number | null;
      finishStatus: string;
      rawPointsAwarded: number;
      participationPointsAwarded: number;
      manualPenaltyPoints: number;
      correctionPoints: number;
      manualPenaltyReason: string | null;
      notes: string | null;
    }>;
  };
  isMulticlass: boolean;
}) {
  const result = reg.raceResults[0];
  const action = upsertRaceResult.bind(null, slug, seasonId, roundId, reg.id);

  const totalPoints = result
    ? result.rawPointsAwarded +
      (includeParticipation ? result.participationPointsAwarded : 0) -
      result.manualPenaltyPoints
    : 0;

  return (
    <form
      action={action}
      className="rounded border border-zinc-800 bg-zinc-900 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className={`font-semibold ${reg.excludedAt || reg.retiredAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}>
            {reg.startNumber != null && (
              <span className="mr-2 text-zinc-500 no-underline">#{reg.startNumber}</span>
            )}
            <CountryFlag code={reg.user.countryCode} />{reg.user.firstName} {reg.user.lastName}
            {reg.excludedAt && (
              <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                Excluded
              </span>
            )}
            {reg.retiredAt && !reg.excludedAt && (
              <span className="ml-2 rounded bg-amber-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300 no-underline">
                Retired
              </span>
            )}
          </span>
          <span className="ml-3 text-xs text-zinc-500">
            {reg.team?.name ?? "Independent"}
            {isMulticlass && reg.carClass && ` • ${reg.carClass.name}`}
          </span>
        </div>
        {result && (
          <div className="text-xs text-zinc-400">
            Points:{" "}
            <span className="font-bold text-orange-400">{totalPoints}</span>
            <span className="ml-1 text-zinc-600">
              ({result.rawPointsAwarded}
              {includeParticipation
                ? `+${result.participationPointsAwarded}`
                : result.participationPointsAwarded > 0
                  ? `, +${result.participationPointsAwarded} part. excl.`
                  : ""}
              {result.manualPenaltyPoints > 0 &&
                `−${result.manualPenaltyPoints}`}
              )
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Field
          label="Finish status"
          name="finishStatus"
          type="select"
          defaultValue={result?.finishStatus ?? "CLASSIFIED"}
          options={["CLASSIFIED", "DNF", "DNS", "DSQ"]}
        />
        <Field
          label="Position"
          name="finishPosition"
          type="number"
          defaultValue={String(result?.finishPosition ?? "")}
          min={0}
          max={999}
        />
        <Field
          label="Grid"
          name="startPosition"
          type="number"
          defaultValue={result?.startPosition != null ? String(result.startPosition) : ""}
          min={0}
          max={999}
        />
        <Field
          label="Laps"
          name="lapsCompleted"
          type="number"
          defaultValue={String(result?.lapsCompleted ?? 0)}
          min={0}
        />
        <Field
          label="Distance %"
          name="raceDistancePct"
          type="number"
          defaultValue={String(result?.raceDistancePct ?? 100)}
          min={0}
          max={100}
        />
        <Field
          label="Incidents"
          name="incidents"
          type="number"
          defaultValue={String(result?.incidents ?? 0)}
          min={0}
        />
        <Field
          label="Total time"
          name="totalTime"
          type="text"
          defaultValue={formatMsToTime(result?.totalTimeMs)}
          placeholder="1:23:45.678"
        />
        <Field
          label="Best lap"
          name="bestLapTime"
          type="text"
          defaultValue={formatMsToTime(result?.bestLapTimeMs)}
          placeholder="1:53.456"
        />
        <Field
          label="Quali"
          name="qualifyingTime"
          type="text"
          defaultValue={formatMsToTime(result?.qualifyingTimeMs)}
          placeholder="1:53.456"
        />
        <Field
          label="Penalty pts"
          name="manualPenaltyPoints"
          type="number"
          defaultValue={String(result?.manualPenaltyPoints ?? 0)}
          min={0}
        />
        <Field
          label="Correction"
          name="correctionPoints"
          type="number"
          defaultValue={String(result?.correctionPoints ?? 0)}
          placeholder="+/- adjust"
        />
        <Field
          label="Penalty reason"
          name="manualPenaltyReason"
          type="text"
          defaultValue={result?.manualPenaltyReason ?? ""}
          placeholder="e.g. unsafe rejoin T3"
          wide
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Save row
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  options,
  min,
  max,
  wide,
}: {
  label: string;
  name: string;
  type?: "text" | "number" | "select";
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  wide?: boolean;
}) {
  return (
    <label
      className={`block ${wide ? "col-span-2 md:col-span-3 lg:col-span-3" : ""}`}
    >
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {type === "select" && options ? (
        <select
          name={name}
          defaultValue={defaultValue}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          min={min}
          max={max}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
      )}
    </label>
  );
}

function AdminRegList({
  registrations,
  cls,
  slug,
  seasonId,
  roundId,
  isMulticlass,
  participationInCombined,
}: {
  registrations: Array<Parameters<typeof ResultRow>[0]["reg"]>;
  cls: "combined" | "pro" | "am" | "team";
  slug: string;
  seasonId: string;
  roundId: string;
  isMulticlass: boolean;
  /** Mirrors ScoringSystem.participationInCombined. Pro/Am tabs always
   * include participation (match standings classTotal); Combined/Team
   * respect the flag (match standings combinedTotal). */
  participationInCombined: boolean;
}) {
  // Pro/Am tabs match the standings classTotal which always includes
  // participation. Combined/Team match combinedTotal which is gated.
  const includeParticipation =
    cls === "pro" || cls === "am" ? true : participationInCombined;
  // Class filter — on the driver's Pro/Am tier (Registration.proAmClass), NOT
  // carClass.shortCode. The clean Pro/Am model has no car class on the
  // registration, so the old carClass filter left the tabs empty. proAmClass is
  // populated for the legacy season too, so this works for both.
  let filtered = registrations;
  if (cls === "pro") {
    filtered = registrations.filter((r) => r.proAmClass === "PRO");
  } else if (cls === "am") {
    filtered = registrations.filter((r) => r.proAmClass === "AM");
  }

  if (cls !== "team") {
    if (filtered.length === 0) {
      return (
        <p className="text-sm text-zinc-500">No drivers in this view.</p>
      );
    }
    return (
      <div className="space-y-3">
        {filtered.map((reg) => (
          <ResultRow
            key={reg.id}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            reg={reg}
            isMulticlass={isMulticlass}
            includeParticipation={includeParticipation}
          />
        ))}
      </div>
    );
  }

  // Team view: group by team name, expandable per team
  const byTeam = new Map<
    string,
    typeof registrations
  >();
  for (const reg of registrations) {
    const key = reg.team?.name ?? "Independent";
    const arr = byTeam.get(key);
    if (arr) arr.push(reg);
    else byTeam.set(key, [reg]);
  }
  const groups = [...byTeam.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div className="space-y-3">
      {groups.map(([teamName, regs]) => (
        <details
          key={teamName}
          className="overflow-hidden rounded border border-zinc-800"
          open={cls === "team"}
        >
          <summary className="flex cursor-pointer items-center gap-3 bg-zinc-900 px-3 py-2 hover:bg-zinc-800">
            <span className="flex-1 font-medium">{teamName}</span>
            <span className="text-xs text-zinc-500">
              {regs.length} {regs.length === 1 ? "driver" : "drivers"}
            </span>
          </summary>
          <div className="space-y-3 p-3">
            {regs.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={isMulticlass}
                includeParticipation={includeParticipation}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
