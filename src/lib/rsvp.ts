/**
 * Pure RSVP helpers — shared by the website server action (src/lib/actions/rsvp.ts)
 * AND the Discord interactions API route (src/app/api/discord/interactions/route.ts).
 *
 * Do NOT add "use server" here — Next.js can silently drop API routes that
 * transitively import a "use server" module. See CLAUDE.md "Common gotchas".
 */

import { prisma } from "@/lib/prisma";
import { editBotMessage } from "@/lib/discord-bot";
import { buildRsvpEmbed, type RsvpDriverSummary } from "@/lib/discord-rsvp-embed";
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
 * Look up a User by their Discord ID (Account.providerAccountId where provider=discord).
 * Returns null if no User has that Discord ID linked.
 */
export async function findUserByDiscordId(discordId: string) {
  const account = await prisma.account.findFirst({
    where: { provider: "discord", providerAccountId: discordId },
    select: { userId: true },
  });
  if (!account) return null;
  return prisma.user.findUnique({
    where: { id: account.userId },
    select: { id: true, name: true, firstName: true, lastName: true },
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
}): Promise<UpsertRsvpResult> {
  const { roundId, userId, status, source } = args;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, seasonId: true, status: true },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  // Driver must have a Registration in the round's season.
  const registration = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: round.seasonId, userId } },
    select: { id: true, excludedAt: true, status: true },
  });
  if (!registration || registration.excludedAt) {
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

  // Fire-and-forget Discord refresh — failure here does NOT roll back the
  // database upsert. The website widget will still reflect the change, and
  // the next button click or refresh will rebuild the embed correctly.
  refreshDiscordRsvpMessage(roundId).catch(() => {});

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
}): Promise<ToggleDeclineResult> {
  const { roundId, userId, source } = args;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, seasonId: true },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const registration = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: round.seasonId, userId } },
    select: { id: true, excludedAt: true },
  });
  if (!registration || registration.excludedAt) {
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
    refreshDiscordRsvpMessage(roundId).catch(() => {});
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
  refreshDiscordRsvpMessage(roundId).catch(() => {});
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
          _count: { select: { registrations: { where: { excludedAt: null } } } },
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
      seasonLabel: `${round.season.year} ${round.season.name}`,
      roundNumber: round.roundNumber,
      roundName: round.name,
      track: round.track,
      trackConfig: round.trackConfig,
      startsAt: round.startsAt,
      roundUrl,
      drivers,
      totalRegistered: round.season._count.registrations,
      rsvpMode: round.season.league.rsvpMode,
      closed: round.status !== "UPCOMING",
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
            where: { excludedAt: null },
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

  const rows = round.season.registrations.map((reg) => {
    const rsvp = byRegId.get(reg.id);
    return {
      registrationId: reg.id,
      userId: reg.userId,
      displayName: driverDisplayName(reg.user),
      status: rsvp?.status ?? null,
      source: rsvp?.source ?? null,
      respondedAt: rsvp?.respondedAt ?? null,
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
