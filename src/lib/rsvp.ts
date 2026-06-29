/**
 * Pure RSVP helpers — shared by the website server action (src/lib/actions/rsvp.ts)
 * AND the Discord interactions API route (src/app/api/discord/interactions/route.ts).
 *
 * Do NOT add "use server" here — Next.js can silently drop API routes that
 * transitively import a "use server" module. See CLAUDE.md "Common gotchas".
 */

import { prisma } from "@/lib/prisma";
import { editBotMessage } from "@/lib/discord-bot";
import {
  buildRsvpEmbed,
  resolveLogoUrl,
  type RsvpDriverSummary,
} from "@/lib/discord-rsvp-embed";
import { isRsvpClosed } from "@/lib/rsvp-window";
import type { RsvpStatus, RsvpSource } from "@prisma/client";

export type UpsertRsvpResult =
  | { ok: true; status: RsvpStatus; registrationId: string }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "user-not-registered"
        | "season-not-active";
    };

/**
 * Look up a User by their Discord ID. Two resolution paths:
 *
 *  1. `Account.providerAccountId` (provider=discord) — set automatically the
 *     first time the driver signs in to the website with Discord.
 *  2. `User.discordId` — set manually by an admin on a pre-registered driver
 *     who has NOT logged in yet. Lets the RSVP bot resolve their clicks
 *     before that first login.
 *
 * Returns null if no User has that Discord ID by either path.
 */
export async function findUserByDiscordId(discordId: string) {
  const select = {
    id: true,
    name: true,
    firstName: true,
    lastName: true,
  } as const;

  const account = await prisma.account.findFirst({
    where: { provider: "discord", providerAccountId: discordId },
    select: { userId: true },
  });
  if (account) {
    return prisma.user.findUnique({
      where: { id: account.userId },
      select,
    });
  }

  // Fallback: admin pre-linked the Discord ID directly on the User row.
  return prisma.user.findUnique({
    where: { discordId },
    select,
  });
}

export function driverDisplayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string {
  const fl = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return fl || u.name || "Driver";
}

/**
 * Core upsert. Validates the driver has a Registration in the round's season,
 * writes/updates the RoundRsvp row, and refreshes the Discord message embed.
 *
 * Returns a structured result rather than throwing — both callers (HTTP route
 * and server action) translate it into their own response shape.
 */
export async function upsertRsvp(args: {
  roundId: string;
  userId: string;
  status: RsvpStatus;
  source: RsvpSource;
  /**
   * If true, skip the Discord embed refresh. The caller is responsible for
   * triggering it (usually in a background task via `after()`). Used by the
   * Discord interactions endpoint to keep the response under Discord's 3s
   * deadline; the embed refresh runs after the response is sent.
   */
  skipRefresh?: boolean;
}): Promise<UpsertRsvpResult> {
  const { roundId, userId, status, source, skipRefresh } = args;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, seasonId: true, status: true },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  // Driver must have a Registration in the round's season. Non-driving team
  // managers never RSVP — they don't race.
  const registration = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: round.seasonId, userId } },
    select: { id: true, excludedAt: true, status: true, isTeamManager: true },
  });
  if (!registration || registration.excludedAt || registration.isTeamManager) {
    return { ok: false, reason: "user-not-registered" };
  }

  await prisma.roundRsvp.upsert({
    where: {
      roundId_registrationId: {
        roundId,
        registrationId: registration.id,
      },
    },
    create: {
      roundId,
      registrationId: registration.id,
      status,
      source,
    },
    update: {
      status,
      source,
      respondedAt: new Date(),
    },
  });

  // Discord embed refresh. The caller can opt out via skipRefresh and run
  // the refresh in the background (via Next.js `after()`) to stay under
  // Discord's 3s interaction deadline. When inlined here, it's awaited
  // because Vercel kills serverless functions as soon as the response is
  // sent — fire-and-forget promises don't run to completion.
  if (!skipRefresh) {
    try {
      await refreshDiscordRsvpMessage(roundId);
    } catch {
      /* swallow */
    }
  }

  return { ok: true, status, registrationId: registration.id };
}

/**
 * Result of a click in DECLINE_ONLY mode (Discord or website) where the
 * intent is to toggle a decline rather than upsert any status.
 */
export type ToggleDeclineResult =
  | { ok: true; action: "added" | "removed" }
  | { ok: false; reason: "round-not-found" | "user-not-registered" };

/**
 * Toggle a driver's DECLINED RSVP. If they already have a DECLINED row,
 * remove it (they're back on the grid). Otherwise create one (they've
 * declined). Used by DECLINE_ONLY leagues so a single button drives both
 * "I can't race" and "Actually, I can race after all".
 *
 * Idempotency: re-running with the same state is a no-op.
 */
export async function toggleDecline(args: {
  roundId: string;
  userId: string;
  source: "DISCORD" | "WEBSITE";
  /** See upsertRsvp.skipRefresh for the rationale. */
  skipRefresh?: boolean;
}): Promise<ToggleDeclineResult> {
  const { roundId, userId, source, skipRefresh } = args;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, seasonId: true },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const registration = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: round.seasonId, userId } },
    select: { id: true, excludedAt: true, isTeamManager: true },
  });
  if (!registration || registration.excludedAt || registration.isTeamManager) {
    return { ok: false, reason: "user-not-registered" };
  }

  const existing = await prisma.roundRsvp.findUnique({
    where: {
      roundId_registrationId: { roundId, registrationId: registration.id },
    },
    select: { id: true, status: true },
  });

  if (existing?.status === "DECLINED") {
    await prisma.roundRsvp.delete({ where: { id: existing.id } });
    if (!skipRefresh) {
      try {
        await refreshDiscordRsvpMessage(roundId);
      } catch {
        /* swallow */
      }
    }
    return { ok: true, action: "removed" };
  }

  await prisma.roundRsvp.upsert({
    where: {
      roundId_registrationId: { roundId, registrationId: registration.id },
    },
    create: {
      roundId,
      registrationId: registration.id,
      status: "DECLINED",
      source,
    },
    update: { status: "DECLINED", source, respondedAt: new Date() },
  });
  if (!skipRefresh) {
    try {
      await refreshDiscordRsvpMessage(roundId);
    } catch {
      /* swallow */
    }
  }
  return { ok: true, action: "added" };
}

/**
 * Rebuild the Discord embed for a round and PATCH the original message.
 * Idempotent — safe to call repeatedly. Bails silently if the round has
 * no Discord message stored, or env vars are missing.
 */
export async function refreshDiscordRsvpMessage(roundId: string): Promise<void> {
  const msg = await prisma.roundDiscordRsvpMessage.findUnique({
    where: { roundId },
  });
  if (!msg) return;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: true,
          _count: { select: { registrations: { where: { excludedAt: null, isTeamManager: false } } } },
        },
      },
      rsvps: {
        include: {
          registration: {
            include: {
              user: {
                select: { name: true, firstName: true, lastName: true },
              },
            },
          },
        },
      },
    },
  });
  if (!round) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const roundUrl = `${baseUrl}/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}`;

  const drivers: RsvpDriverSummary[] = round.rsvps.map((r) => ({
    registrationId: r.registrationId,
    displayName: driverDisplayName(r.registration.user),
    status: r.status,
  }));

  const payload = buildRsvpEmbed(
    {
      leagueName: round.season.league.name,
      leagueLogoUrl: resolveLogoUrl(round.season.league.logoUrl),
      seasonLabel: `${round.season.year} ${round.season.name}`,
      roundNumber: round.roundNumber,
      roundName: round.name,
      track: round.track,
      trackConfig: round.trackConfig,
      startsAt: round.startsAt,
      roundUrl,
      // GT3 WCT: link the public "Grid & Waiting List" page for this round.
      gridUrl:
        round.season.league.slug === "cas-gt3-wct" ? `${roundUrl}/grid` : null,
      drivers,
      totalRegistered: round.season._count.registrations,
      maxDrivers: round.season.maxDrivers,
      rsvpMode: round.season.league.rsvpMode,
      embedColor: round.season.league.discordEmbedColor,
      closed: isRsvpClosed({
        startsAt: round.startsAt,
        status: round.status,
        rsvpCloseBeforeHours: round.season.league.rsvpCloseBeforeHours,
      }),
    },
    round.id
  );

  await editBotMessage(msg.channelId, msg.messageId, payload);
}

/**
 * Summary used by the admin overview page.
 */
export async function getRoundRsvpSummary(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: true,
          registrations: {
            where: { excludedAt: null, isTeamManager: false },
            include: {
              user: {
                select: { id: true, name: true, firstName: true, lastName: true },
              },
            },
          },
        },
      },
      rsvps: true,
    },
  });
  if (!round) return null;

  const byRegId = new Map(round.rsvps.map((r) => [r.registrationId, r]));

  // ── Eligibility ("may drive this round") ──────────────────────────────────
  // Computed LIVE and positionally, independent of whether a fill-in offer was
  // ever sent (historical declines predate the offer engine, so we can't rely
  // on stored RoundFillIn rows):
  //   - A confirmed grid driver (APPROVED, not waitlisted) is always eligible.
  //   - Each confirmed driver who DECLINED this round frees one seat. The first
  //     N waiting-list drivers (by registration date) become eligible for this
  //     round, where N = number of confirmed decliners.
  // A waiting-list driver's own RSVP (e.g. they declined the fill-in) is shown
  // in the Status column and does not change their positional eligibility here.
  const isConfirmedGrid = (reg: (typeof round.season.registrations)[number]) =>
    reg.status === "APPROVED" && reg.waitlistedAt == null;

  const confirmedDeclineCount = round.season.registrations.filter(
    (reg) => isConfirmedGrid(reg) && byRegId.get(reg.id)?.status === "DECLINED"
  ).length;

  const eligibleWaitlistIds = new Set(
    round.season.registrations
      .filter((reg) => reg.status === "APPROVED" && reg.waitlistedAt != null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, confirmedDeclineCount)
      .map((reg) => reg.id)
  );

  const rows = round.season.registrations.map((reg) => {
    const rsvp = byRegId.get(reg.id);
    const confirmed = isConfirmedGrid(reg);
    const promoted = eligibleWaitlistIds.has(reg.id);
    const eligibility: "confirmed" | "fillin" | "waitlist" | "pending" =
      confirmed
        ? "confirmed"
        : promoted
        ? "fillin"
        : reg.waitlistedAt != null
        ? "waitlist"
        : "pending";
    return {
      registrationId: reg.id,
      userId: reg.userId,
      displayName: driverDisplayName(reg.user),
      status: rsvp?.status ?? null,
      source: rsvp?.source ?? null,
      respondedAt: rsvp?.respondedAt ?? null,
      eligible: confirmed || promoted,
      eligibility,
    };
  });

  const counts = {
    accepted: rows.filter((r) => r.status === "ACCEPTED").length,
    declined: rows.filter((r) => r.status === "DECLINED").length,
    tentative: rows.filter((r) => r.status === "TENTATIVE").length,
    silent: rows.filter((r) => r.status === null).length,
    total: rows.length,
  };

  return { round, rows, counts };
}
