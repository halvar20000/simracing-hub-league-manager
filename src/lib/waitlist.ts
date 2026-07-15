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
import { sendResendEmail } from "@/lib/resend-email";
import { buildFillInOfferComponents } from "@/lib/discord-rsvp-embed";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";

/** Minimal HTML wrapper for the transactional fill-in emails. */
function emailHtml(bodyHtml: string): string {
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
    `font-size:15px;line-height:1.5;color:#18181b">${bodyHtml}</div>`
  );
}

/** Confirmed-driver filter: counts against the season cap. */
const CONFIRMED_WHERE = {
  status: "APPROVED" as const,
  excludedAt: null,
  retiredAt: null,
  isTeamManager: false,
  waitlistedAt: null,
};

/** Waiting-list filter: APPROVED but parked above the cap. */
const WAITLIST_WHERE = {
  status: "APPROVED" as const,
  excludedAt: null,
  retiredAt: null,
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

/** Context shared by every fill-in offer notification for a round. */
type FillInOfferContext = {
  roundId: string;
  leagueName: string;
  roundLabel: string; // e.g. "Round 3: Spa"
  track: string;
  raceWhen: string;
  roundLink: string;
  /** League admin recipients (registrationNotifyEmails). */
  adminEmails: string[];
};

/** Resolve a user's display name + email for notifications. */
async function userContact(
  userId: string
): Promise<{ name: string; email: string | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, firstName: true, lastName: true, email: true },
  });
  const name =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.name || "Driver";
  return { name, email: u?.email ?? null };
}

/**
 * Notify a waiting-list driver that they've been offered a one-race fill-in.
 *
 *  - Discord DM with interactive Accept / Decline buttons (primary channel).
 *  - Email to the driver ALWAYS, alongside the DM (chosen behaviour): reliable
 *    even when Discord DMs are closed/unlinked; the email links to the round
 *    page and tells them to Accept in Discord or reply to their admin.
 *  - Email to the league admin list on every fresh offer, so they can have the
 *    iRacing invite ready.
 *
 * Returns true if the driver was reached by at least one channel (DM or email).
 */
async function notifyFillInOffer(
  userId: string,
  ctx: FillInOfferContext,
  opts: { notifyAdmin: boolean } = { notifyAdmin: true }
): Promise<boolean> {
  const { name, email } = await userContact(userId);

  const dmContent =
    `🏁 A spot just opened for **${ctx.leagueName} — ${ctx.roundLabel}** ` +
    `(${ctx.track}, ${ctx.raceWhen}). As the next driver on the waiting list, ` +
    `you're invited to take this race. Click **Accept this race** below to ` +
    `lock it in — your league admin will then send your iRacing race invite. ` +
    `Can't make it? Click **Can't make it** and we'll offer it to the next ` +
    `driver. Details: ${ctx.roundLink}`;

  const discordId = await discordIdForUser(userId);
  let dmOk = false;
  if (discordId) {
    const res = await sendDirectMessage(discordId, {
      content: dmContent,
      components: buildFillInOfferComponents(ctx.roundId),
      allowed_mentions: { parse: [] },
    });
    dmOk = res.ok;
  }

  let emailOk = false;
  if (email) {
    const html = emailHtml(
      `<p>🏁 A spot just opened in <strong>${ctx.leagueName} — ${ctx.roundLabel}</strong> ` +
        `(${ctx.track}, ${ctx.raceWhen}).</p>` +
        `<p>As the next driver on the waiting list, you're invited to take this race.</p>` +
        `<p><strong>To accept:</strong> open Discord and click <em>Accept this race</em> on the ` +
        `message from the league bot, or reply to your league admin to confirm your entry. ` +
        `Your admin will send your iRacing race invite once you accept.</p>` +
        `<p><a href="${ctx.roundLink}">View the round &rarr;</a></p>`
    );
    const res = await sendResendEmail({
      to: email,
      subject: `🏁 You're invited to fill in — ${ctx.leagueName}, ${ctx.roundLabel}`,
      html,
      text:
        `A spot just opened in ${ctx.leagueName} — ${ctx.roundLabel} ` +
        `(${ctx.track}, ${ctx.raceWhen}). As the next driver on the waiting list, ` +
        `you're invited to take this race. Open Discord and click "Accept this race" ` +
        `on the bot's message, or reply to your league admin to confirm. ` +
        `Round: ${ctx.roundLink}`,
    });
    emailOk = res.ok;
  }

  if (opts.notifyAdmin && ctx.adminEmails.length > 0) {
    const html = emailHtml(
      `<p>🏁 <strong>${name}</strong> was offered the open fill-in slot for ` +
        `<strong>${ctx.leagueName} — ${ctx.roundLabel}</strong> (${ctx.track}, ${ctx.raceWhen}).</p>` +
        `<p>They've been notified by Discord DM${email ? " and email" : ""}. ` +
        `If they accept, have their iRacing race invite ready.</p>` +
        `<p><a href="${ctx.roundLink}">Open the round &rarr;</a></p>`
    );
    await sendResendEmail({
      to: ctx.adminEmails,
      subject: `Fill-in offered: ${name} — ${ctx.leagueName}, ${ctx.roundLabel}`,
      html,
      text:
        `${name} was offered the open fill-in slot for ${ctx.leagueName} — ` +
        `${ctx.roundLabel} (${ctx.track}, ${ctx.raceWhen}). ` +
        `If they accept, have their iRacing race invite ready. ${ctx.roundLink}`,
    });
  }

  return dmOk || emailOk;
}

/**
 * Email the league admin list that a fill-in driver ACCEPTED their offer, so
 * the admin can send the iRacing race invite. Called from the Discord
 * interactions route when the Accept button is clicked.
 */
export async function notifyAdminFillInAccepted(roundId: string, userId: string): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      name: true,
      roundNumber: true,
      track: true,
      startsAt: true,
      seasonId: true,
      season: {
        select: {
          league: {
            select: { slug: true, name: true, registrationNotifyEmails: true },
          },
        },
      },
    },
  });
  if (!round) return;
  const adminEmails = (round.season.league.registrationNotifyEmails ?? []).filter(
    (e) => e && e.includes("@")
  );
  if (adminEmails.length === 0) return;

  const { name } = await userContact(userId);
  const roundLabel = `Round ${round.roundNumber}: ${round.name}`;
  const raceWhen = round.startsAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  const roundLink = `${SITE_URL}/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${roundId}/rsvp`;
  const html = emailHtml(
    `<p>✅ <strong>${name}</strong> ACCEPTED the fill-in for ` +
      `<strong>${round.season.league.name} — ${roundLabel}</strong> (${round.track}, ${raceWhen}).</p>` +
      `<p>Send their iRacing race invite to lock in the entry.</p>` +
      `<p><a href="${roundLink}">Open the round RSVP overview &rarr;</a></p>`
  );
  await sendResendEmail({
    to: adminEmails,
    subject: `✅ Fill-in accepted: ${name} — ${round.season.league.name}, ${roundLabel}`,
    html,
    text:
      `${name} accepted the fill-in for ${round.season.league.name} — ${roundLabel} ` +
      `(${round.track}, ${raceWhen}). Send their iRacing race invite to lock in the entry. ${roundLink}`,
  });
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
 * Retire (or un-retire) a registration from its season.
 *
 * Retiring keeps every RaceResult, so the driver's championship points and
 * finishing position are untouched — they simply stop counting against the
 * grid cap and drop out of every forward-looking flow (RSVP, fill-ins,
 * no-show penalties; all keyed off `retiredAt`). Because the retired driver
 * no longer occupies a confirmed seat, we recompute the waiting list, which
 * promotes the next waiting-list driver into the freed seat and DMs them.
 *
 * Un-retiring clears the flag and recomputes again — the returning driver
 * reclaims a seat if the cap allows, otherwise the waiting-list ranking (by
 * registration date) decides who is confirmed vs parked.
 *
 * Idempotent. Works for every league/season; the cap side-effects are no-ops
 * when the season has no `maxDrivers` configured.
 */
export async function setRegistrationRetired(
  registrationId: string,
  retired: boolean
): Promise<void> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { seasonId: true, retiredAt: true },
  });
  if (!reg) return;
  const currentlyRetired = reg.retiredAt != null;
  if (currentlyRetired === retired) return; // no change

  await prisma.registration.update({
    where: { id: registrationId },
    data: {
      retiredAt: retired ? new Date() : null,
      // Retiring frees the grid seat; a returning driver starts off the
      // waiting list and is re-ranked by the recompute below.
      ...(retired ? { waitlistedAt: null } : {}),
    },
  });

  // Retire → the freed seat promotes the next waiting-list driver (DM sent by
  // the recompute). Un-retire → re-rank so the cap is honoured again.
  await recomputeWaitlistForSeason(reg.seasonId);
}

/**
 * Order-proof waiting-list reconciliation for a whole season — the single
 * source of truth for who is a confirmed grid driver vs. on the waiting list.
 *
 * Ranks every "active" registration (PENDING or APPROVED, not excluded, not a
 * team manager) by registration date (`createdAt` ascending). The earliest
 * `cap` ranks are grid seats; everyone beyond the cap is the waiting list —
 * REGARDLESS of the order in which the admin approves them. This removes the
 * old foot-gun where approving a later registration before an earlier (still
 * pending) one could hand the later driver a grid seat.
 *
 * Only APPROVED registrations actually carry the `waitlistedAt` flag (a PENDING
 * registration is shown as pending, not "on the waiting list"), but a pending
 * entry still OCCUPIES its registration-date rank — so an earlier pending
 * registration reserves a seat ahead of a later one. If an earlier registration
 * is later rejected/withdrawn, ranks shift and the next approved driver is
 * promoted (and DM'd).
 *
 * Pure, idempotent, safe to call after any approve / reject / withdraw / status
 * change. No cap configured → clears any stray `waitlistedAt` and returns.
 */
export async function recomputeWaitlistForSeason(
  seasonId: string
): Promise<void> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      maxDrivers: true,
      name: true,
      league: { select: { name: true } },
    },
  });
  const cap = season?.maxDrivers ?? null;

  // Active registrations in registration-date order. Both PENDING and APPROVED
  // occupy a rank; REJECTED / WITHDRAWN / excluded / managers do not.
  const active = await prisma.registration.findMany({
    where: {
      seasonId,
      status: { in: ["PENDING", "APPROVED"] },
      excludedAt: null,
      retiredAt: null,
      isTeamManager: false,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, status: true, waitlistedAt: true },
  });

  if (cap == null) {
    // Feature off: nobody should be flagged waitlisted.
    const stray = active.filter((r) => r.waitlistedAt != null);
    if (stray.length > 0) {
      await prisma.registration.updateMany({
        where: { id: { in: stray.map((r) => r.id) } },
        data: { waitlistedAt: null },
      });
    }
    return;
  }

  const promotedUserIds: string[] = [];
  for (let rank = 0; rank < active.length; rank++) {
    const reg = active[rank];
    // Pending entries hold their rank but never carry the waitlist flag.
    if (reg.status !== "APPROVED") continue;

    const shouldBeWaitlisted = rank >= cap; // first `cap` ranks are grid seats
    const isWaitlisted = reg.waitlistedAt != null;
    if (shouldBeWaitlisted === isWaitlisted) continue;

    await prisma.registration.update({
      where: { id: reg.id },
      data: { waitlistedAt: shouldBeWaitlisted ? new Date() : null },
    });
    // Flipping OFF the flag = promotion into a confirmed seat → DM the driver.
    if (!shouldBeWaitlisted) promotedUserIds.push(reg.userId);
  }

  for (const userId of promotedUserIds) {
    try {
      await dmUser(
        userId,
        `🟢 A spot opened up in **${season!.league.name} — ${season!.name}** ` +
          `and you've moved off the waiting list into a confirmed seat for the ` +
          `season. See you on track! ${SITE_URL}`
      );
    } catch {
      /* best-effort — the seat change already persisted */
    }
  }
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
      roundNumber: true,
      track: true,
      startsAt: true,
      seasonId: true,
      season: {
        select: {
          maxDrivers: true,
          name: true,
          league: {
            select: { slug: true, name: true, registrationNotifyEmails: true },
          },
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
        retiredAt: null,
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

  // Shared context for every fill-in offer notification (DM + driver email +
  // admin email) sent below.
  const offerCtx: FillInOfferContext = {
    roundId: round.id,
    leagueName: round.season.league.name,
    roundLabel: `Round ${round.roundNumber}: ${round.name}`,
    track: round.track,
    raceWhen,
    roundLink,
    adminEmails: (round.season.league.registrationNotifyEmails ?? []).filter(
      (e) => e && e.includes("@")
    ),
  };

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
  //    GT3 WCT only, and ONLY for Round 1 of the season: skip drivers not
  //    flagged "Startberechtigt Round 1" (eligibleRound1). The flag exists so a
  //    brand-new, unclassified driver isn't auto-offered the SEASON-OPENER slot
  //    before the admin has cleared them. It does NOT gate later rounds: a
  //    driver who registers after R1 has run can drive every subsequent round
  //    regardless of the flag, so from R2 onward every waiting-list driver is a
  //    valid fill-in candidate. Other leagues ignore the flag entirely.
  const enforceEligibility =
    round.season.league.slug === "cas-gt3-wct" && round.roundNumber === 1;
  let needed = openSlots - existing.length;
  if (needed > 0) {
    const alreadyFilling = new Set(existing.map((e) => e.registrationId));
    const candidates = await prisma.registration.findMany({
      where: {
        seasonId: round.seasonId,
        ...WAITLIST_WHERE,
        ...(enforceEligibility ? { eligibleRound1: true } : {}),
      },
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
      // Fresh offer: DM with Accept/Decline buttons + email the driver + email
      // the league admin list.
      const ok = await notifyFillInOffer(c.userId, offerCtx, { notifyAdmin: true });
      if (ok) {
        await prisma.roundFillIn.update({
          where: { id: created.id },
          data: { notifiedAt: new Date() },
        });
      }
      needed--;
    }
  }

  // 4) Retry notification for kept fill-ins that were never successfully
  //    notified (an earlier DM + email both failed). Don't re-notify the admin
  //    here — they were already emailed when the offer was first created.
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
    const ok = await notifyFillInOffer(reg.userId, offerCtx, { notifyAdmin: false });
    if (ok) {
      await prisma.roundFillIn.update({
        where: { id: f.id },
        data: { notifiedAt: new Date() },
      });
    }
  }
}
