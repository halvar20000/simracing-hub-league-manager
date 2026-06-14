/**
 * Waiting-list + one-race fill-in engine.
 *
 * PURE helper module — NO `"use server"`. Imported by server actions AND the
 * Discord interactions API route (see the "Common gotchas" note in CLAUDE.md:
 * a `"use server"` file imported by an API route can be silently dropped from
 * the build). Keep this file free of `"use server"`.
 *
 * Concepts
 * --------
 * - A season opts into the waiting list by setting `Season.maxDrivers` (the cap
 *   already exposed on the admin season-edit page; for the new GT3 WCT season
 *   set it to 50). No cap set ⇒ waiting list disabled, everything behaves as
 *   before.
 * - Confirmed grid driver = APPROVED registration, not excluded, not a team
 *   manager, `waitlistedAt == null`.
 * - Waiting-list driver = APPROVED registration, not excluded, not a team
 *   manager, `waitlistedAt != null`. Order is by `createdAt` ASC (registration
 *   date) — first to register is first in line.
 * - When a confirmed driver DECLINES a round (RSVP), the earliest waiting-list
 *   driver is offered THAT round only (RoundFillIn) and DM'd. Reconciled
 *   idempotently so un-declining revokes the surplus fill-in.
 * - When a confirmed driver permanently leaves (WITHDRAWN / REJECTED /
 *   excluded), the earliest waiting-list driver is promoted into the freed
 *   season seat and DM'd.
 */

import { prisma } from "@/lib/prisma";
import { sendDirectMessage } from "@/lib/discord-bot";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";

/** Confirmed-driver filter: counts against the season cap. */
const CONFIRMED_WHERE = {
  status: "APPROVED" as const,
  excludedAt: null,
  isTeamManager: false,
  waitlistedAt: null,
};

/** Waiting-list filter: APPROVED but parked above the cap. */
const WAITLIST_WHERE = {
  status: "APPROVED" as const,
  excludedAt: null,
  isTeamManager: false,
  waitlistedAt: { not: null },
};

export type SeasonCapInfo = {
  seasonId: string;
  slug: string;
  cap: number | null;
  confirmed: number;
  waitlistCount: number;
  /** True when the season has a cap configured (waiting list active). */
  enabled: boolean;
  /** Confirmed seats still open before the cap is reached. */
  openSeats: number;
};

/** Number of confirmed grid drivers for a season. */
export async function countConfirmedDrivers(seasonId: string): Promise<number> {
  return prisma.registration.count({
    where: { seasonId, ...CONFIRMED_WHERE },
  });
}

/** Snapshot of a season's cap / confirmed / waitlist counts. */
export async function getSeasonCapInfo(seasonId: string): Promise<SeasonCapInfo> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, maxDrivers: true, league: { select: { slug: true } } },
  });
  const cap = season?.maxDrivers ?? null;
  const [confirmed, waitlistCount] = await Promise.all([
    countConfirmedDrivers(seasonId),
    prisma.registration.count({ where: { seasonId, ...WAITLIST_WHERE } }),
  ]);
  return {
    seasonId,
    slug: season?.league.slug ?? "",
    cap,
    confirmed,
    waitlistCount,
    enabled: cap != null,
    openSeats: cap == null ? Number.POSITIVE_INFINITY : Math.max(0, cap - confirmed),
  };
}

export type WaitlistEntry = {
  registrationId: string;
  userId: string;
  name: string | null;
  startNumber: string | null;
  registeredAt: Date;
  /** 1-based position in the queue. */
  position: number;
};

/** Ordered waiting list for a season (earliest registration first). */
export async function getWaitlist(seasonId: string): Promise<WaitlistEntry[]> {
  const rows = await prisma.registration.findMany({
    where: { seasonId, ...WAITLIST_WHERE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      startNumber: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return rows.map((r, i) => ({
    registrationId: r.id,
    userId: r.userId,
    name: r.user.name,
    startNumber: r.startNumber,
    registeredAt: r.createdAt,
    position: i + 1,
  }));
}

/** Resolve a user's Discord ID for DMs: linked OAuth account, then admin-set field. */
async function discordIdForUser(userId: string): Promise<string | null> {
  const acct = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  if (acct?.providerAccountId) return acct.providerAccountId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true },
  });
  return user?.discordId ?? null;
}

async function dmUser(userId: string, content: string): Promise<boolean> {
  const discordId = await discordIdForUser(userId);
  if (!discordId) return false;
  const res = await sendDirectMessage(discordId, {
    content,
    allowed_mentions: { parse: [] },
  });
  return res.ok;
}

/**
 * Decide whether a just-APPROVED registration should be confirmed or parked on
 * the waiting list, and persist `waitlistedAt` accordingly. Idempotent.
 *
 * Counts confirmed drivers EXCLUDING this registration; if that already meets
 * the cap, this driver goes onto the waiting list. Team managers and excluded
 * registrations never count and are never waitlisted.
 */
export async function applyWaitlistOnApprove(registrationId: string): Promise<{
  waitlisted: boolean;
}> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      seasonId: true,
      status: true,
      excludedAt: true,
      isTeamManager: true,
      waitlistedAt: true,
      season: { select: { maxDrivers: true } },
    },
  });
  if (!reg) return { waitlisted: false };

  const cap = reg.season.maxDrivers ?? null;

  // No cap, not approved, excluded, or a team manager → never waitlisted.
  if (
    cap == null ||
    reg.status !== "APPROVED" ||
    reg.excludedAt != null ||
    reg.isTeamManager
  ) {
    if (reg.waitlistedAt != null) {
      await prisma.registration.update({
        where: { id: reg.id },
        data: { waitlistedAt: null },
      });
    }
    return { waitlisted: false };
  }

  const confirmedOthers = await prisma.registration.count({
    where: { seasonId: reg.seasonId, ...CONFIRMED_WHERE, id: { not: reg.id } },
  });

  const shouldWaitlist = confirmedOthers >= cap;
  if (shouldWaitlist && reg.waitlistedAt == null) {
    await prisma.registration.update({
      where: { id: reg.id },
      data: { waitlistedAt: new Date() },
    });
  } else if (!shouldWaitlist && reg.waitlistedAt != null) {
    await prisma.registration.update({
      where: { id: reg.id },
      data: { waitlistedAt: null },
    });
  }
  return { waitlisted: shouldWaitlist };
}

/**
 * Manually move a registration on/off the waiting list (admin override —
 * not cap-checked). Promoting (onList=false) DMs the driver. Idempotent.
 */
export async function setRegistrationWaitlisted(
  registrationId: string,
  onList: boolean
): Promise<void> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      userId: true,
      waitlistedAt: true,
      season: {
        select: { name: true, league: { select: { name: true } } },
      },
    },
  });
  if (!reg) return;
  const currentlyOnList = reg.waitlistedAt != null;
  if (currentlyOnList === onList) return; // no change

  await prisma.registration.update({
    where: { id: registrationId },
    data: { waitlistedAt: onList ? new Date() : null },
  });

  if (!onList) {
    await dmUser(
      reg.userId,
      `🟢 You've been moved off the waiting list into a confirmed seat for ` +
        `**${reg.season.league.name} — ${reg.season.name}**. See you on track! ${SITE_URL}`
    );
  }
}

/**
 * Fill any open confirmed seats from the waiting list (FIFO by registration
 * date) and DM each promoted driver. Call after a confirmed driver permanently
 * leaves (withdraw / reject / exclude) or after the cap is raised. Idempotent.
 */
export async function promoteFromWaitlist(seasonId: string): Promise<number> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      maxDrivers: true,
      name: true,
      league: { select: { slug: true, name: true } },
    },
  });
  const cap = season?.maxDrivers ?? null;
  if (cap == null) return 0;

  let promoted = 0;
  // Loop, re-counting each round so we never over-promote past the cap.
  // Bounded by the waiting-list length.
  for (;;) {
    const confirmed = await countConfirmedDrivers(seasonId);
    if (confirmed >= cap) break;
    const next = await prisma.registration.findFirst({
      where: { seasonId, ...WAITLIST_WHERE },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });
    if (!next) break;
    await prisma.registration.update({
      where: { id: next.id },
      data: { waitlistedAt: null },
    });
    promoted++;
    await dmUser(
      next.userId,
      `🟢 A spot opened up in **${season!.league.name} — ${season!.name}** and ` +
        `you were next on the waiting list. You now have a confirmed seat for the ` +
        `season. See you on track! ${SITE_URL}`
    );
  }
  return promoted;
}

/**
 * Reconcile one-race fill-ins for a round so the number of fill-ins matches the
 * number of confirmed drivers who have DECLINED that round. Idempotent:
 *   - the offered fill-in driver ALSO declines → drop their fill-in and offer
 *     the slot to the next waiting-list driver (the queue chains down the list).
 *   - too few fill-ins → offer the next waiting-list driver(s) the slot + DM.
 *   - too many (a confirmed driver un-declined) → revoke the newest surplus + DM.
 *   - existing fill-ins missing a DM (notify failed earlier) → retry the DM.
 *
 * Only runs for capped seasons. Safe to call on every RSVP decline toggle.
 */
export async function reconcileFillInsForRound(roundId: string): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      name: true,
      track: true,
      startsAt: true,
      seasonId: true,
      season: {
        select: {
          maxDrivers: true,
          name: true,
          league: { select: { slug: true, name: true } },
        },
      },
    },
  });
  if (!round || round.season.maxDrivers == null) return;

  // Every APPROVED driver (confirmed OR waitlisted) who DECLINED this round.
  // A confirmed decliner opens a slot; a waitlisted decliner is the fill-in
  // driver passing on the offer — either way we must not (re-)offer them.
  const declinedRsvps = await prisma.roundRsvp.findMany({
    where: {
      roundId,
      status: "DECLINED",
      registration: {
        seasonId: round.seasonId,
        status: "APPROVED",
        excludedAt: null,
        isTeamManager: false,
      },
    },
    select: {
      registrationId: true,
      registration: { select: { waitlistedAt: true } },
    },
  });
  const openSlots = declinedRsvps.filter(
    (d) => d.registration.waitlistedAt == null
  ).length;
  const declinedRegIds = new Set(declinedRsvps.map((d) => d.registrationId));

  let existing = await prisma.roundFillIn.findMany({
    where: { roundId },
    orderBy: { createdAt: "asc" },
    select: { id: true, registrationId: true, notifiedAt: true },
  });

  const raceWhen = round.startsAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  const roundLink = `${SITE_URL}/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}`;
  const offerMessage = (verb: string) =>
    `🏁 A spot ${verb} for **${round.season.league.name} — ${round.name}** ` +
    `(${round.track}, ${raceWhen}). As the next driver on the waiting list, ` +
    `you're invited to take this race. Reply to your league admin to confirm ` +
    `your iRacing entry. Can't make it? Just click Decline on the round and ` +
    `we'll offer it to the next driver. Details: ${roundLink}`;

  // 1) A fill-in driver who DECLINED the offer → drop their fill-in (silently;
  //    they chose to pass) so the slot reopens for the next driver. They keep
  //    their place on the waiting list for other rounds.
  const passedOn = existing.filter((f) => declinedRegIds.has(f.registrationId));
  if (passedOn.length > 0) {
    await prisma.roundFillIn.deleteMany({
      where: { id: { in: passedOn.map((f) => f.id) } },
    });
    existing = existing.filter((f) => !declinedRegIds.has(f.registrationId));
  }

  // 2) Revoke surplus fill-ins (newest first) when a confirmed driver
  //    un-declined and there are now more fill-ins than open slots.
  if (existing.length > openSlots) {
    const surplus = existing.slice(openSlots); // newest are last (asc order)
    for (const f of surplus) {
      const reg = await prisma.registration.findUnique({
        where: { id: f.registrationId },
        select: { userId: true },
      });
      await prisma.roundFillIn.delete({ where: { id: f.id } });
      if (reg) {
        await dmUser(
          reg.userId,
          `↩️ Update on **${round.season.league.name} — ${round.name}**: a driver ` +
            `came back, so the fill-in spot for this round is no longer open. ` +
            `You're still next in line on the waiting list. ${roundLink}`
        );
      }
    }
    existing = existing.slice(0, openSlots);
  }

  // 3) Offer any still-open slots to the next waiting-list drivers (FIFO),
  //    skipping anyone already filling in or who declined this round.
  let needed = openSlots - existing.length;
  if (needed > 0) {
    const alreadyFilling = new Set(existing.map((e) => e.registrationId));
    const candidates = await prisma.registration.findMany({
      where: { seasonId: round.seasonId, ...WAITLIST_WHERE },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });
    for (const c of candidates) {
      if (needed <= 0) break;
      if (alreadyFilling.has(c.id) || declinedRegIds.has(c.id)) continue;
      const created = await prisma.roundFillIn.create({
        data: { roundId, registrationId: c.id },
        select: { id: true },
      });
      const ok = await dmUser(c.userId, offerMessage("just opened"));
      if (ok) {
        await prisma.roundFillIn.update({
          where: { id: created.id },
          data: { notifiedAt: new Date() },
        });
      }
      needed--;
    }
  }

  // 4) Retry DM for kept fill-ins that were never successfully notified.
  const kept = await prisma.roundFillIn.findMany({
    where: { roundId, notifiedAt: null },
    select: { id: true, registrationId: true },
  });
  for (const f of kept) {
    const reg = await prisma.registration.findUnique({
      where: { id: f.registrationId },
      select: { userId: true },
    });
    if (!reg) continue;
    const ok = await dmUser(reg.userId, offerMessage("is open"));
    if (ok) {
      await prisma.roundFillIn.update({
        where: { id: f.id },
        data: { notifiedAt: new Date() },
      });
    }
  }
}
