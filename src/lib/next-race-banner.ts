/**
 * Data for the site-wide "next race" banner (layout, under the nav): the
 * next scored round of any live season, or the one running right now, plus
 * its stream when it is streamed.
 *
 * Streamed = a StreamAnnouncement exists for the round, or the stream
 * calendar names Thomas / Andreas for it. The link comes from the same
 * resolver as the Discord announcement (stream-twitch-url.ts).
 *
 * Round.startsAt / StreamAnnouncement.streamAt are naive Europe/Berlin wall
 * clocks: shown as stored (UTC getters), converted to a real instant only for
 * the countdown and the live check. Cached 60 s: the layout renders on every
 * request.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { liveSeasonFilter } from "@/lib/season-visibility";
import { LEAGUE_TIME_ZONE, reinterpretLocalAsZone } from "@/lib/match-stream";
import { calendarStreamerOf, resolveStreamTwitchUrl } from "@/lib/stream-twitch-url";
import { STREAMERS } from "@/lib/stream-calendar";

export type NextRaceBannerData = {
  href: string;
  leagueName: string;
  leagueLogoUrl: string | null;
  roundLabel: string;
  track: string;
  /** "Wed 19 Nov · 19:00" (Berlin wall clock). */
  whenLabel: string;
  /** Real instants (ISO) for the client countdown / live switch. */
  startIso: string;
  endIso: string;
  stream: { url: string; streamer: string | null; atLabel: string; atIso: string } | null;
};

const DEFAULT_RACE_MINUTES = 120;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Naive wall clock as typed (the server runs in UTC, like formatDateTime). */
const wallLabel = (d: Date) =>
  `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeLabel = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function load(): Promise<NextRaceBannerData | null> {
  const now = Date.now();
  const rounds = await prisma.round.findMany({
    where: {
      ...liveSeasonFilter,
      countsForChampionship: true,
      status: { not: "COMPLETED" },
      season: { ...liveSeasonFilter.season, status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
      // naive wall clock vs. now: a day of slack, the exact check is below
      startsAt: { gte: new Date(now - 24 * 3600_000) },
    },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: {
      id: true,
      seasonId: true,
      roundNumber: true,
      name: true,
      track: true,
      trackConfig: true,
      startsAt: true,
      raceLengthMinutes: true,
      streamAnnouncement: { select: { twitchUrl: true, streamAt: true, scheduledAt: true } },
      season: { select: { league: { select: { slug: true, name: true, logoUrl: true, twitchUrl: true } } } },
    },
  });
  const r = rounds.find((x) => {
    const end = reinterpretLocalAsZone(x.startsAt, LEAGUE_TIME_ZONE).getTime() + (x.raceLengthMinutes ?? DEFAULT_RACE_MINUTES) * 60_000;
    return end > now;
  });
  if (!r) return null;
  const start = reinterpretLocalAsZone(r.startsAt, LEAGUE_TIME_ZONE);
  const end = new Date(start.getTime() + (r.raceLengthMinutes ?? DEFAULT_RACE_MINUTES) * 60_000);
  const league = r.season.league;

  let stream: NextRaceBannerData["stream"] = null;
  const ann = r.streamAnnouncement;
  const streamer = await calendarStreamerOf(r);
  const isCalendarStreamer = !!streamer && (STREAMERS as readonly string[]).includes(streamer);
  if (ann || isCalendarStreamer) {
    const url = await resolveStreamTwitchUrl(r, ann?.twitchUrl);
    if (url) {
      const at = ann?.streamAt ?? r.startsAt;
      stream = {
        url,
        streamer: isCalendarStreamer ? streamer : null,
        atLabel: timeLabel(at),
        atIso: reinterpretLocalAsZone(at, LEAGUE_TIME_ZONE).toISOString(),
      };
    }
  }

  const name = (r.name ?? "").trim();
  return {
    href: `/leagues/${league.slug}/seasons/${r.seasonId}/rounds/${r.id}`,
    leagueName: league.name,
    leagueLogoUrl: league.logoUrl,
    roundLabel: `R${r.roundNumber}${name && name !== r.track && !/^(round|r)\s*\d+$/i.test(name) ? ` · ${name}` : ""}`,
    track: `${r.track}${r.trackConfig ? ` (${r.trackConfig})` : ""}`,
    whenLabel: wallLabel(r.startsAt),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    stream,
  };
}

export const getNextRaceBanner = unstable_cache(
  () => load().catch(() => null),
  ["next-race-banner-v1"],
  { revalidate: 60 },
);
