import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { formatDateTime } from "@/lib/date";
import { twitchVideoUrl } from "@/lib/twitch";

export const metadata: Metadata = pageMetadata({
  title: "Race Streams",
  description:
    "Every CAS race stream replay in one place — newest first, across all leagues, with a direct link to each YouTube or Twitch video.",
  url: "/streams",
});

const pillBase =
  "rounded-full px-3 py-1 text-sm transition-colors whitespace-nowrap";
const pillOn = "bg-[#ff6b35] text-zinc-950 font-medium";
const pillOff = "border border-zinc-700 text-zinc-300 hover:bg-zinc-900";

export default async function StreamsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: leagueParam } = await searchParams;

  // All published rounds that have a linked stream video, across visible
  // (non-archived) leagues, newest race first.
  const rounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ youtubeVideoId: { not: null } }, { twitchVideoId: { not: null } }],
      season: { league: { isArchived: false } },
    },
    select: {
      id: true,
      roundNumber: true,
      name: true,
      track: true,
      trackConfig: true,
      startsAt: true,
      youtubeVideoId: true,
      twitchVideoId: true,
      twitchThumbnailUrl: true,
      seasonId: true,
      season: {
        select: {
          name: true,
          year: true,
          league: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  // Build the league filter chips from leagues that actually have streams.
  const leagueChips = new Map<string, string>(); // slug -> name
  for (const r of rounds) {
    const lg = r.season.league;
    if (!leagueChips.has(lg.slug)) leagueChips.set(lg.slug, lg.name);
  }

  const selectedSlug =
    leagueParam && leagueChips.has(leagueParam) ? leagueParam : null;
  const visible = selectedSlug
    ? rounds.filter((r) => r.season.league.slug === selectedSlug)
    : rounds;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Race Streams</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {visible.length} stream{visible.length === 1 ? "" : "s"}
          {selectedSlug ? ` · ${leagueChips.get(selectedSlug)}` : ""} · newest
          first. Each opens the full replay on YouTube or Twitch.
        </p>
      </div>

      {leagueChips.size > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/streams"
            className={`${pillBase} ${selectedSlug === null ? pillOn : pillOff}`}
          >
            All leagues
          </Link>
          {[...leagueChips.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([slug, name]) => (
              <Link
                key={slug}
                href={`/streams?league=${encodeURIComponent(slug)}`}
                className={`${pillBase} ${selectedSlug === slug ? pillOn : pillOff}`}
              >
                {name}
              </Link>
            ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No race streams linked yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => {
            // YouTube wins when a round somehow has both (a permanent
            // re-upload beats an expiring Twitch archive).
            const isYt = Boolean(r.youtubeVideoId);
            const href = isYt
              ? `https://www.youtube.com/watch?v=${r.youtubeVideoId}`
              : twitchVideoUrl(r.twitchVideoId!);
            const thumb = isYt
              ? `https://i.ytimg.com/vi/${r.youtubeVideoId}/mqdefault.jpg`
              : r.twitchThumbnailUrl;
            return (
            <a
              key={r.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
            >
              <div className="relative aspect-video bg-gradient-to-br from-[#3a1d6e] to-black">
                {thumb && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumb}
                    // Empty alt on purpose: a deleted Twitch VOD's thumbnail
                    // 404s, and an empty alt collapses to nothing so the
                    // gradient behind it shows instead of a broken-image icon.
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {/* Play overlay */}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-110">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="ml-0.5 h-6 w-6"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#ff6b35]">
                  {r.season.league.name}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium tracking-normal normal-case ${
                      isYt
                        ? "bg-red-950/60 text-red-300"
                        : "bg-purple-950/60 text-purple-300"
                    }`}
                  >
                    {isYt ? "YouTube" : "Twitch"}
                  </span>
                </div>
                <div className="mt-1 font-medium leading-snug text-zinc-100">
                  R{r.roundNumber} — {r.track}
                  {r.trackConfig ? ` (${r.trackConfig})` : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {r.season.name} {r.season.year} · {formatDateTime(r.startsAt)}
                </div>
              </div>
            </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
