import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public iCalendar feed of every planned round across ACTIVE /
 * OPEN_REGISTRATION seasons. Subscribable from Outlook, Google Calendar,
 * Apple Calendar — all of which re-fetch periodically.
 *
 * URL: /api/calendar  → text/calendar; charset=utf-8
 *
 * Window: today − 14 days … today + 180 days. Calendar apps typically pull
 * once per day, so the rolling window keeps the feed light without losing
 * either upcoming season detail or the recently-raced reference.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODID = "-//CAS//CLS Race Calendar//EN";
const CALNAME = "CAS Race Calendar";
const CALDESC = "Every planned race across CAS leagues.";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com"
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYYMMDDTHHMMSSZ — UTC instant per RFC 5545 §3.3.5 form #2. */
function icsUtc(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * TIMEZONE CONVENTION (important): Round.startsAt stores the *Europe/Berlin
 * wall-clock time* in a UTC-typed column — the admin form's datetime-local
 * string is parsed with `new Date()` on a UTC server, so "20:00" is saved
 * as 20:00Z. All server-rendered pages format on that same UTC server, so
 * the site shows the intended wall time everywhere. The ICS feed must
 * therefore NOT stamp these values as UTC instants ("...Z") — calendar apps
 * would shift them +1h/+2h on import. Instead we emit the wall time as
 * RFC 5545 form #3 (local time with TZID=Europe/Berlin, VTIMEZONE below),
 * which also keeps CET/CEST transitions correct.
 */
const TZID = "Europe/Berlin";

/** YYYYMMDDTHHMMSS — wall time per RFC 5545 §3.3.5 form #3 (with TZID).
 *  Uses the UTC getters because that's where the wall time lives (see
 *  convention note above). */
function icsWall(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

/** Escape a text value per RFC 5545 §3.3.11. */
function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold a content line to 75 octets per RFC 5545 §3.1. We approximate octets
 * with characters; all values written here are ASCII or near-ASCII, so the
 * difference is immaterial.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  // First piece uses 75 chars; continuation pieces use 74 (the leading space
  // counts toward the 75-octet limit).
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    parts.push(s.slice(0, 74));
    s = s.slice(74);
  }
  if (s.length > 0) parts.push(s);
  return parts.join("\r\n ");
}

function shortLeague(name: string): string {
  return name.replace(/^CAS\s+/i, "");
}

/**
 * Total calendar-event length per league, in minutes, measured from
 * startsAt — covers the whole evening (practice + quali + race), not just
 * the race. Values confirmed by Thomas 2026-07-25. Leagues not listed fall
 * back to raceLengthMinutes + 45 min pre-race.
 */
const EVENT_LENGTH_BY_LEAGUE: Record<string, number> = {
  "cas-gt3-wct": 190, // 3h10
  "cas-pccd": 105, // 1h45
  "cas-sfl-cup": 105, // 1h45
  "nascar-cas-cup": 120, // 2h00
};

export async function GET() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const windowEnd = new Date(now.getTime() + 180 * 24 * 3600 * 1000);

  const rounds = await prisma.round.findMany({
    where: {
      startsAt: { gte: windowStart, lt: windowEnd },
      // DRAFT included intentionally — matches the /calendar page filter so
      // subscribed clients see new seasons as soon as their rounds are
      // scheduled. PAUSED stays excluded (that status hides a season
      // everywhere).
      season: { status: { in: ["DRAFT", "OPEN_REGISTRATION", "ACTIVE"] } },
    },
    include: {
      season: {
        include: {
          league: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(`PRODID:${PRODID}`);
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${icsText(CALNAME)}`);
  lines.push(`X-WR-CALDESC:${icsText(CALDESC)}`);
  lines.push(`X-WR-TIMEZONE:${TZID}`);
  // Tell calendar clients to refresh roughly hourly.
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  lines.push("X-PUBLISHED-TTL:PT1H");

  // VTIMEZONE for Europe/Berlin (CET/CEST, EU rules since 1996) — required
  // so the TZID references on DTSTART/DTEND resolve in every client.
  lines.push("BEGIN:VTIMEZONE");
  lines.push(`TZID:${TZID}`);
  lines.push(`X-LIC-LOCATION:${TZID}`);
  lines.push("BEGIN:DAYLIGHT");
  lines.push("TZOFFSETFROM:+0100");
  lines.push("TZOFFSETTO:+0200");
  lines.push("TZNAME:CEST");
  lines.push("DTSTART:19700329T020000");
  lines.push("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
  lines.push("END:DAYLIGHT");
  lines.push("BEGIN:STANDARD");
  lines.push("TZOFFSETFROM:+0200");
  lines.push("TZOFFSETTO:+0100");
  lines.push("TZNAME:CET");
  lines.push("DTSTART:19701025T030000");
  lines.push("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
  lines.push("END:STANDARD");
  lines.push("END:VTIMEZONE");

  const dtstamp = icsUtc(now);
  const site = siteUrl();

  for (const r of rounds) {
    const start = r.startsAt;
    const durationMin =
      EVENT_LENGTH_BY_LEAGUE[r.season.league.slug] ??
      (r.raceLengthMinutes ?? 60) + 45;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const leagueShort = shortLeague(r.season.league.name);
    const summary = `${leagueShort} R${r.roundNumber} — ${r.name}`;
    const trackLine = r.trackConfig
      ? `${r.track} (${r.trackConfig})`
      : r.track;
    const roundUrl = `${site}/leagues/${r.season.league.slug}/seasons/${r.seasonId}/rounds/${r.id}`;
    const seasonLabel = `${r.season.name} ${r.season.year}`;
    const description = `${r.season.league.name} · ${seasonLabel}\\nRound page: ${roundUrl}`;
    // Stable UID — round.id is a cuid, globally unique.
    const uid = `${r.id}@league.simracing-hub.com`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;TZID=${TZID}:${icsWall(start)}`);
    lines.push(`DTEND;TZID=${TZID}:${icsWall(end)}`);
    lines.push(fold(`SUMMARY:${icsText(summary)}`));
    lines.push(fold(`LOCATION:${icsText(trackLine)}`));
    lines.push(fold(`URL:${roundUrl}`));
    lines.push(fold(`DESCRIPTION:${description}`));
    // RoundStatus is UPCOMING | IN_PROGRESS | COMPLETED — all of these are
    // on the official schedule, so CONFIRMED. (If a "cancelled" status is
    // ever added, branch here to emit STATUS:CANCELLED.)
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 mandates CRLF line endings, and an empty terminating line is
  // recommended for safety.
  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cas-calendar.ics"',
      // Calendar clients respect Cache-Control; we want them to re-fetch
      // rather than serve stale schedule data.
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
