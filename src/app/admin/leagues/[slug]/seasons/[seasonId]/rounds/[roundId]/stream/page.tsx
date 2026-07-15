import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  saveStreamAnnouncement,
  deleteStreamAnnouncement,
  postStreamNow,
  refreshStreamEmbed,
} from "@/lib/actions/stream-announcements";

function toLocalInputValue(d: Date): string {
  // datetime-local input expects "YYYY-MM-DDTHH:mm" with no timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export default async function AdminRoundStreamPage({
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
      streamAnnouncement: true,
    },
  });
  if (!round || round.season.league.slug !== slug || round.seasonId !== seasonId) {
    notFound();
  }

  const a = round.streamAnnouncement;
  const league = round.season.league;
  const defaultSchedule = a?.scheduledAt
    ? toLocalInputValue(a.scheduledAt)
    : toLocalInputValue(
        new Date(round.startsAt.getTime() - 30 * 60 * 1000)
      ); // default = 30 min before race start
  // "Stream live" time shown in the embed. Defaults to the race start.
  const defaultStreamAt = a?.streamAt
    ? toLocalInputValue(a.streamAt)
    : toLocalInputValue(round.startsAt);

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
          Stream announcement — R{round.roundNumber} {round.name}
        </h1>
        <p className="text-sm text-zinc-400">
          Schedule a Twitch stream announcement post for this round. The CLS
          bot will post the poster + Twitch link to the league&apos;s configured
          stream channel at the scheduled time. Cron picks it up within ~10
          minutes of the scheduled moment.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {ok}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        <div className="font-semibold text-zinc-200 mb-1">League config</div>
        <div>
          Stream channel ID:{" "}
          <span className="font-mono text-zinc-300">
            {league.discordStreamChannelId ?? "(unset — set on league edit)"}
          </span>
        </div>
        <div>
          Default Twitch URL:{" "}
          {league.twitchUrl ? (
            <a
              href={league.twitchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline"
            >
              {league.twitchUrl}
            </a>
          ) : (
            <span className="text-zinc-500">(unset)</span>
          )}
        </div>
      </section>

      <form
        action={saveStreamAnnouncement}
        encType="multipart/form-data"
        className="space-y-4 rounded border border-zinc-800 bg-zinc-900 p-4"
      >
        <input type="hidden" name="leagueSlug" value={slug} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="roundId" value={roundId} />

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Post at — when the announcement is sent to Discord (your local time)
          </span>
          <input
            type="datetime-local"
            name="scheduledAt"
            required
            defaultValue={defaultSchedule}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Race starts at{" "}
            <span className="font-mono">{round.startsAt.toISOString()}</span>
            . Cron polls every 10 min — post will fire within 10 min of this
            time. This is only the posting moment; it is NOT shown in the embed.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Stream goes live at — shown as &quot;Stream live&quot; in the embed
            (your local time)
          </span>
          <input
            type="datetime-local"
            name="streamAt"
            defaultValue={defaultStreamAt}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            When the Twitch stream actually starts. Leave blank to fall back to
            the &quot;Post at&quot; time.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Poster image (PNG/JPG/WebP, max 20 MB — JPEG keeps files smaller)
          </span>
          <input
            type="file"
            name="poster"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="block text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-orange-500"
          />
          {a?.posterBlobUrl && (
            <div className="mt-2 inline-block overflow-hidden rounded border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.posterBlobUrl}
                alt="Current poster"
                className="block max-h-44 object-contain"
              />
            </div>
          )}
          <span className="mt-1 block text-xs text-zinc-500">
            {a?.posterBlobUrl
              ? "Leave empty to keep the current poster."
              : "Required for first save."}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Twitch URL (overrides league default, optional)
          </span>
          <input
            type="url"
            name="twitchUrl"
            defaultValue={a?.twitchUrl ?? ""}
            placeholder={league.twitchUrl ?? "https://twitch.tv/…"}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Custom message (optional)
          </span>
          <textarea
            name="messageText"
            defaultValue={a?.messageText ?? ""}
            rows={3}
            placeholder="Tonight at 18:00 CEST — Adelaide Street Circuit. Don't miss it!"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-500"
          >
            Save announcement
          </button>
        </div>
      </form>

      {a && (
        <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Status</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-500">Post at</dt>
            <dd className="font-mono text-zinc-200">
              {a.scheduledAt.toISOString()}
            </dd>
            <dt className="text-zinc-500">Stream live at</dt>
            <dd className="font-mono text-zinc-200">
              {(a.streamAt ?? a.scheduledAt).toISOString()}
              {a.streamAt ? "" : " (fallback → Post at)"}
            </dd>
            <dt className="text-zinc-500">Posted at</dt>
            <dd className="font-mono text-zinc-200">
              {a.postedAt?.toISOString() ?? "(not yet)"}
            </dd>
            <dt className="text-zinc-500">Discord channel</dt>
            <dd className="font-mono text-zinc-200">
              {a.discordChannelId ?? "—"}
            </dd>
            <dt className="text-zinc-500">Discord message id</dt>
            <dd className="font-mono text-zinc-200">
              {a.discordMessageId ?? "—"}
            </dd>
          </dl>

          <div className="flex flex-wrap gap-2 pt-2">
            <form action={postStreamNow}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <button
                type="submit"
                className="rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
                title={
                  a.postedAt
                    ? "Posts a NEW Discord message. The previous post stays as is."
                    : "Posts the announcement to the configured Discord channel now."
                }
              >
                Post now
              </button>
            </form>
            <form action={refreshStreamEmbed}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="roundId" value={roundId} />
              <button
                type="submit"
                disabled={!a.postedAt}
                title={
                  a.postedAt
                    ? "Edits the existing Discord message in place with the current poster / message / Twitch URL / schedule time."
                    : "No posted message to edit yet — use Post now first."
                }
                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-800"
              >
                Refresh embed
              </button>
            </form>
            <details>
              <summary className="cursor-pointer rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                Danger zone
              </summary>
              <form action={deleteStreamAnnouncement} className="mt-2">
                <input type="hidden" name="leagueSlug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <button
                  type="submit"
                  className="rounded border border-red-900/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30"
                >
                  Delete announcement (also deletes Discord message + blob)
                </button>
              </form>
            </details>
          </div>
        </section>
      )}
    </div>
  );
}
