/**
 * Create / sync Discord Guild Scheduled Events for upcoming races.
 *
 * Each upcoming round becomes an EXTERNAL scheduled event in the league's
 * Discord guild. Discord then shows it in the server's Events tab and fires
 * its native "starting soon" reminder (~15 min before) — exactly the small
 * pop-up window the league wants. The event is not tied to a channel; it is
 * purely a reminder.
 *
 * Idempotent WITHOUT a schema change: we list the guild's existing scheduled
 * events and match by the deterministic event name. If a match exists we
 * update it when the start/end/location drifted (e.g. a reschedule); otherwise
 * we create it. `force` recreates/updates regardless.
 *
 * Gating: any league with `discordGuildId` set. The bot needs the
 * MANAGE_EVENTS permission in that guild.
 *
 * Not a "use server" module — imported by both the cron route and the admin
 * server action.
 */

import { prisma } from "@/lib/prisma";
import {
  listGuildScheduledEvents,
  createGuildScheduledEvent,
  modifyGuildScheduledEvent,
  type GuildScheduledEvent,
} from "@/lib/discord-bot";
import { resolveLogoUrl } from "@/lib/discord-rsvp-embed";
import { buildEventCoverDataUri } from "@/lib/race-event-cover";

/** Default race duration when a round has no raceLengthMinutes set. */
const DEFAULT_DURATION_MIN = 120;
/** How far ahead the cron creates events. */
export const RACE_EVENT_DAYS_AHEAD = 30;

/**
 * The league's home timezone. CLS stores round start times as a naive
 * wall-clock (the admin types e.g. "19:00" with no timezone), so when sending
 * a real UTC instant to Discord we must interpret that wall-clock in this zone.
 * All CAS racing is scheduled in German time.
 */
const LEAGUE_TIME_ZONE = "Europe/Berlin";

/** How many ms a timezone is ahead of UTC at a given instant (DST-aware). */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - at.getTime();
}

/**
 * Reinterpret a Date's runtime-local wall-clock as a wall-clock in `timeZone`
 * and return the true UTC instant. If the runtime already runs in `timeZone`
 * this is a no-op, so it's safe regardless of the server's TZ setting.
 */
function reinterpretLocalAsZone(d: Date, timeZone: string): Date {
  const asUTC = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds()
  );
  const guess = new Date(asUTC);
  return new Date(asUTC - zoneOffsetMs(guess, timeZone));
}

export type EnsureRaceEventResult =
  | { ok: true; action: "created" | "updated" | "unchanged"; eventId: string }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "not-configured" // league has no discordGuildId
        | "start-in-past"
        | "list-failed"
        | "create-failed"
        | "update-failed";
      detail?: string;
    };

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

export function buildEventName(
  leagueName: string,
  roundNumber: number,
  track: string
): string {
  return truncate(`${leagueName} · R${roundNumber} ${track}`, 100);
}

export function buildEventLocation(
  track: string,
  trackConfig: string | null
): string {
  return truncate(
    `${track}${trackConfig ? ` (${trackConfig})` : ""}` || "iRacing",
    100
  );
}

type RoundForEvent = {
  id: string;
  roundNumber: number;
  name: string;
  track: string;
  trackConfig: string | null;
  startsAt: Date;
  raceLengthMinutes: number | null;
  seasonId: string;
  season: {
    name: string;
    year: number;
    league: {
      name: string;
      slug: string;
      discordGuildId: string | null;
      logoUrl: string | null;
    };
  };
};

/** Discord cover images max out at 10 MB; league logos are far smaller. */
const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/**
 * Fetch the league logo and return it as a base64 data URI for Discord's
 * scheduled-event `image` field. Returns null on any failure (missing logo,
 * fetch error, non-image, too large) — the event is still created without a
 * cover image.
 */
async function fetchLogoDataUri(
  logoUrl: string | null
): Promise<string | undefined> {
  const url = resolveLogoUrl(logoUrl);
  if (!url) return undefined;
  // Preferred: the logo padded onto a correctly-sized banner so Discord
  // doesn't scale it up to fill the cover.
  const cover = await buildEventCoverDataUri(url);
  if (cover) return cover;
  // Fallback: raw logo bytes (may look large) — better than no logo at all.
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_LOGO_BYTES) return undefined;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function buildPayload(round: RoundForEvent, image?: string) {
  const league = round.season.league;
  // round.startsAt holds a naive wall-clock; interpret it in the league's
  // home timezone to get the correct instant Discord should localize.
  const start = reinterpretLocalAsZone(round.startsAt, LEAGUE_TIME_ZONE);
  const end = new Date(
    start.getTime() +
      (round.raceLengthMinutes ?? DEFAULT_DURATION_MIN) * 60 * 1000
  );
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const roundUrl = `${baseUrl}/leagues/${league.slug}/seasons/${round.seasonId}/rounds/${round.id}`;
  return {
    name: buildEventName(league.name, round.roundNumber, round.track),
    description: truncate(
      `Round ${round.roundNumber} of ${league.name} — ${round.season.name} ${round.season.year}.\n${roundUrl}`,
      1000
    ),
    location: buildEventLocation(round.track, round.trackConfig),
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    ...(image ? { image } : {}),
  };
}

/** An existing event is "live" (worth matching) when SCHEDULED or ACTIVE. */
function isLiveEvent(e: GuildScheduledEvent): boolean {
  return e.status === 1 || e.status === 2;
}

/**
 * Ensure a Discord scheduled event exists (and is up to date) for one round.
 * Pass `existing` to reuse a guild event list already fetched by the caller
 * (the cron fetches once per guild).
 */
export async function ensureRaceEventForRound(
  roundId: string,
  opts: { force?: boolean; existing?: GuildScheduledEvent[] } = {}
): Promise<EnsureRaceEventResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: {
            select: {
              name: true,
              slug: true,
              discordGuildId: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const guildId = round.season.league.discordGuildId;
  if (!guildId) return { ok: false, reason: "not-configured" };

  if (round.startsAt.getTime() <= Date.now())
    return { ok: false, reason: "start-in-past" };

  const image = await fetchLogoDataUri(round.season.league.logoUrl);
  const payload = buildPayload(round as RoundForEvent, image);

  // Resolve the guild's current scheduled events (reuse if provided).
  let events = opts.existing;
  if (!events) {
    const list = await listGuildScheduledEvents(guildId);
    if (!list.ok) return { ok: false, reason: "list-failed", detail: list.body };
    events = list.data;
  }

  const match = events.find(
    (e) => isLiveEvent(e) && e.name === payload.name
  );

  if (match) {
    const drifted =
      match.scheduled_start_time !== payload.scheduled_start_time ||
      match.scheduled_end_time !== payload.scheduled_end_time ||
      (match.entity_metadata?.location ?? "") !== payload.location;
    if (!opts.force && !drifted)
      return { ok: true, action: "unchanged", eventId: match.id };

    // Try with the cover image; if Discord rejects it (unsupported format,
    // too large, etc.) retry without the image so a bad logo never blocks
    // the event itself.
    let upd = await modifyGuildScheduledEvent(guildId, match.id, payload);
    if (!upd.ok && payload.image) {
      const { image: _drop, ...noImage } = payload;
      upd = await modifyGuildScheduledEvent(guildId, match.id, noImage);
    }
    if (!upd.ok) return { ok: false, reason: "update-failed", detail: upd.body };
    return { ok: true, action: "updated", eventId: match.id };
  }

  let created = await createGuildScheduledEvent(guildId, payload);
  if (!created.ok && payload.image) {
    const { image: _drop, ...noImage } = payload;
    created = await createGuildScheduledEvent(guildId, noImage);
  }
  if (!created.ok)
    return { ok: false, reason: "create-failed", detail: created.body };
  return { ok: true, action: "created", eventId: created.data.id };
}

export type CreateUpcomingSummary = {
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: { id: string; reason: string }[];
};

/**
 * Cron entrypoint: create/sync scheduled events for every upcoming round
 * (within RACE_EVENT_DAYS_AHEAD) in an active season whose league has a
 * Discord guild configured. Fetches each guild's event list once.
 */
export async function createRaceEventsForUpcomingRounds(): Promise<CreateUpcomingSummary> {
  const now = Date.now();
  const horizon = new Date(now + RACE_EVENT_DAYS_AHEAD * 24 * 3600 * 1000);

  const rounds = await prisma.round.findMany({
    where: {
      status: "UPCOMING",
      startsAt: { gt: new Date(now), lte: horizon },
      season: {
        isArchived: false,
        status: { in: ["OPEN_REGISTRATION", "ACTIVE"] },
        league: { discordGuildId: { not: null } },
      },
    },
    include: {
      season: {
        include: {
          league: {
            select: { name: true, slug: true, discordGuildId: true },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  });

  const summary: CreateUpcomingSummary = {
    created: [],
    updated: [],
    unchanged: [],
    skipped: [],
  };

  // Cache one event-list fetch per guild.
  const listCache = new Map<string, GuildScheduledEvent[] | null>();

  for (const round of rounds) {
    const guildId = round.season.league.discordGuildId!;
    if (!listCache.has(guildId)) {
      const list = await listGuildScheduledEvents(guildId);
      listCache.set(guildId, list.ok ? list.data : null);
    }
    const existing = listCache.get(guildId);
    if (existing == null) {
      summary.skipped.push({ id: round.id, reason: "list-failed" });
      continue;
    }

    const res = await ensureRaceEventForRound(round.id, { existing });
    if (res.ok) {
      if (res.action === "created") {
        summary.created.push(round.id);
        // Keep the local cache coherent so a duplicate isn't created within
        // the same run (unlikely, but cheap insurance).
        existing.push({
          id: res.eventId,
          guild_id: guildId,
          name: buildEventName(
            round.season.league.name,
            round.roundNumber,
            round.track
          ),
          scheduled_start_time: round.startsAt.toISOString(),
          scheduled_end_time: null,
          entity_type: 3, // EXTERNAL
          status: 1, // SCHEDULED
        });
      } else if (res.action === "updated") summary.updated.push(round.id);
      else summary.unchanged.push(round.id);
    } else {
      summary.skipped.push({ id: round.id, reason: res.reason });
    }
  }

  return summary;
}
