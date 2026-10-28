/**
 * The push-notification sweep behind /api/cron/push (every 10 min on the
 * Hetzner crontab). Independent of the Discord notifiers on purpose: those
 * depend on per-league channel config and switches, a driver's phone should
 * not.
 *
 * Four announcements per round, each sent at most once (PushDispatch):
 *   race-soon  — ~1 h before the start, approved drivers who did not decline
 *   rsvp       — when the RSVP window opens, approved drivers with no answer
 *   results    — once the round is COMPLETED (published), the season's drivers
 *                + every device on "results-all"
 *   reporting  — when the incident-reporting window opens, drivers who raced
 *
 * A window that opened long ago (e.g. on the first run after a deploy) is
 * stamped with sentCount 0 instead of sent, so nobody gets a backlog.
 *
 * Times: Round.startsAt is a naive Europe/Berlin wall-clock (see
 * match-stream.ts), so every comparison with "now" goes through
 * reinterpretLocalAsZone.
 */

import { prisma } from "@/lib/prisma";
import { pushToUsers, type PushPayload, type PushTopic } from "@/lib/push";
import { reinterpretLocalAsZone, LEAGUE_TIME_ZONE } from "@/lib/match-stream";

const HOUR = 3600 * 1000;
/** race-soon fires when the start is at most this far away. */
const RACE_SOON_LEAD_MS = 75 * 60 * 1000;
/** A window older than this is stamped, not announced. */
const FRESH_MS = 24 * HOUR;
/** Results of a round that raced longer ago than this are stamped silently. */
const RESULTS_FRESH_MS = 10 * 24 * HOUR;

type SweepRound = Awaited<ReturnType<typeof loadRounds>>[number];

function startInstant(r: { startsAt: Date }): Date {
  return reinterpretLocalAsZone(r.startsAt, LEAGUE_TIME_ZONE);
}

function wallClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function roundPath(r: SweepRound): string {
  return `/leagues/${r.season.league.slug}/seasons/${r.seasonId}/rounds/${r.id}`;
}

function roundLabel(r: SweepRound): string {
  return `${r.season.league.name} · R${r.roundNumber} ${r.track}`;
}

async function loadRounds(now: Date) {
  return prisma.round.findMany({
    where: {
      season: {
        isArchived: false,
        // COMPLETED too: the final round's results are often published in the
        // same sitting as the season is closed.
        status: { in: ["OPEN_REGISTRATION", "ACTIVE", "COMPLETED"] },
      },
      // Everything a sweep can still act on: upcoming within the RSVP horizon
      // (rsvpDaysBefore is at most a couple of weeks) or raced recently.
      startsAt: {
        gte: new Date(now.getTime() - 14 * 24 * HOUR),
        lte: new Date(now.getTime() + 21 * 24 * HOUR),
      },
    },
    include: {
      season: {
        include: {
          league: true,
          scoringSystem: {
            select: { protestCooldownHours: true, protestWindowHours: true },
          },
          registrations: {
            where: { status: "APPROVED" },
            select: { id: true, userId: true },
          },
        },
      },
      rsvps: { select: { registrationId: true, status: true } },
      raceResults: {
        select: {
          finishStatus: true,
          finishPosition: true,
          raceNumber: true,
          registration: {
            select: {
              userId: true,
              user: {
                select: { firstName: true, lastName: true, name: true },
              },
            },
          },
        },
      },
    },
  });
}

export type SweepOutcome = {
  kind: PushTopic;
  roundId: string;
  sent: number;
  silent: boolean;
};

/**
 * Claim (kind, round) and send. The PushDispatch row is created FIRST so two
 * overlapping runs (host cron + GitHub backup) cannot both send.
 */
async function dispatch(
  kind: PushTopic,
  round: SweepRound,
  fresh: boolean,
  userIds: string[],
  payload: PushPayload,
  alsoTopic?: PushTopic
): Promise<SweepOutcome | null> {
  const claimed = await prisma.pushDispatch.createMany({
    data: [{ kind, roundId: round.id }],
    skipDuplicates: true,
  });
  if (claimed.count === 0) return null;
  const sent = fresh
    ? await pushToUsers([...new Set(userIds)], kind, payload, alsoTopic)
    : 0;
  if (sent > 0) {
    await prisma.pushDispatch.update({
      where: { kind_roundId: { kind, roundId: round.id } },
      data: { sentCount: sent },
    });
  }
  return { kind, roundId: round.id, sent, silent: !fresh };
}

export async function runPushSweep(now = new Date()): Promise<SweepOutcome[]> {
  const rounds = await loadRounds(now);
  if (rounds.length === 0) return [];
  const done = await prisma.pushDispatch.findMany({
    where: { roundId: { in: rounds.map((r) => r.id) } },
    select: { kind: true, roundId: true },
  });
  const isDone = (kind: PushTopic, roundId: string) =>
    done.some((d) => d.kind === kind && d.roundId === roundId);

  const out: SweepOutcome[] = [];
  const push = (o: SweepOutcome | null) => o && out.push(o);

  for (const r of rounds) {
    const start = startInstant(r);
    const lg = r.season.league;
    const regs = r.season.registrations;
    const rsvpByReg = new Map(r.rsvps.map((x) => [x.registrationId, x.status]));
    const running = r.season.status !== "COMPLETED";

    // --- race-soon -------------------------------------------------------
    if (
      running &&
      r.status === "UPCOMING" &&
      !isDone("race-soon", r.id) &&
      start.getTime() > now.getTime() &&
      start.getTime() - now.getTime() <= RACE_SOON_LEAD_MS
    ) {
      const users = regs
        .filter((g) => rsvpByReg.get(g.id) !== "DECLINED")
        .map((g) => g.userId);
      push(
        await dispatch("race-soon", r, true, users, {
          title: `${lg.name}: race at ${wallClock(r.startsAt)}`,
          body: `Round ${r.roundNumber} at ${r.track} starts in about an hour. Good luck!`,
          url: roundPath(r),
          tag: `race-soon-${r.id}`,
        })
      );
    }

    // --- rsvp ------------------------------------------------------------
    const rsvpOpens = new Date(start.getTime() - lg.rsvpDaysBefore * 24 * HOUR);
    const rsvpCloses = new Date(start.getTime() - lg.rsvpCloseBeforeHours * HOUR);
    if (
      running &&
      r.status === "UPCOMING" &&
      !isDone("rsvp", r.id) &&
      rsvpOpens <= now &&
      now < rsvpCloses
    ) {
      const declineOnly = lg.rsvpMode === "DECLINE_ONLY";
      const users = regs.filter((g) => !rsvpByReg.has(g.id)).map((g) => g.userId);
      push(
        await dispatch(
          "rsvp",
          r,
          now.getTime() - rsvpOpens.getTime() <= FRESH_MS,
          users,
          {
            title: `${lg.name}: R${r.roundNumber} ${r.track}`,
            body: declineOnly
              ? "Can't make it? Tap to decline, so the grid is planned right."
              : "Are you racing? Tap to answer the RSVP.",
            url: roundPath(r),
            tag: `rsvp-${r.id}`,
          }
        )
      );
    }

    // --- results (publish gate: COMPLETED only) ----------------------------
    if (
      r.status === "COMPLETED" &&
      r.raceResults.length > 0 &&
      !isDone("results", r.id)
    ) {
      const winner = r.raceResults
        .filter((x) => x.finishPosition === 1)
        .sort((a, b) => a.raceNumber - b.raceNumber)[0];
      const u = winner?.registration.user;
      const winnerName = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || null
        : null;
      push(
        await dispatch(
          "results",
          r,
          now.getTime() - start.getTime() <= RESULTS_FRESH_MS,
          regs.map((g) => g.userId),
          {
            title: `Results: ${roundLabel(r)}`,
            body: winnerName
              ? `Winner: ${winnerName}. Tap for the full classification and standings.`
              : "Tap for the full classification and standings.",
            url: roundPath(r),
            tag: `results-${r.id}`,
          },
          "results-all"
        )
      );
    }

    // --- reporting ---------------------------------------------------------
    const cooldown = r.season.scoringSystem?.protestCooldownHours;
    if (cooldown != null && !isDone("reporting", r.id)) {
      const opens = new Date(start.getTime() + cooldown * HOUR);
      const windowHrs = r.season.scoringSystem?.protestWindowHours;
      const closes = windowHrs != null ? new Date(opens.getTime() + windowHrs * HOUR) : null;
      const drivers = r.raceResults
        .filter((x) => x.finishStatus !== "DNS")
        .map((x) => x.registration.userId);
      // Wait for the results import: until then we don't know who raced.
      // Inside a bounded window that's all the freshness needed; an
      // open-ended one counts as fresh for three days.
      if (opens <= now && (!closes || now < closes) && drivers.length > 0) {
        push(
          await dispatch(
            "reporting",
            r,
            closes != null || now.getTime() - opens.getTime() <= 3 * FRESH_MS,
            drivers,
            {
              title: `${lg.name}: incident reporting open`,
              body: closes
                ? `R${r.roundNumber} ${r.track} — report an incident until ${closes.toLocaleString("en-GB", { timeZone: LEAGUE_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
                : `R${r.roundNumber} ${r.track} — the reporting window is open.`,
              url: `${roundPath(r)}/report`,
              tag: `reporting-${r.id}`,
            }
          )
        );
      }
    }
  }
  return out;
}
