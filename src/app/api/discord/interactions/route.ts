/**
 * Discord Interactions endpoint.
 *
 * Set this URL in the Discord Developer Portal → General Information →
 * "Interactions Endpoint URL":
 *   https://league.simracing-hub.com/api/discord/interactions
 *
 * Discord requires Ed25519 signature verification on the RAW request body.
 * Verification uses DISCORD_PUBLIC_KEY (hex string from Developer Portal).
 *
 * NOTE: must NOT import any "use server" module. Imports rsvp.ts directly,
 * which is a pure helper (no "use server" directive). See CLAUDE.md.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  findUserByDiscordId,
  upsertRsvp,
  toggleDecline,
  refreshDiscordRsvpMessage,
  driverDisplayName,
} from "@/lib/rsvp";
import { parseRsvpCustomId } from "@/lib/discord-rsvp-embed";
import { isRsvpClosed } from "@/lib/rsvp-window";
import { reconcileFillInsForRound } from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Discord interaction types
const PING = 1;
const MESSAGE_COMPONENT = 3;

// Discord interaction response types
const PONG = 1;
const CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DEFERRED_UPDATE_MESSAGE = 6;

// Discord message flags
const EPHEMERAL = 1 << 6;

function getPublicKeyObject(publicKeyHex: string) {
  // Build a DER-encoded SPKI from the raw Ed25519 public key bytes.
  // SPKI prefix for Ed25519 (RFC 8410): 302a300506032b6570032100
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(publicKeyHex, "hex"),
  ]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string
): boolean {
  try {
    const pubKey = getPublicKeyObject(publicKeyHex);
    return verify(
      null, // Ed25519 takes no algorithm name
      Buffer.from(timestamp + rawBody),
      pubKey,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}

function ephemeral(content: string) {
  return NextResponse.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  });
}

export async function POST(req: NextRequest) {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKeyHex) {
    return NextResponse.json(
      { ok: false, error: "DISCORD_PUBLIC_KEY not configured" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  const rawBody = await req.text();
  const ok = verifyDiscordSignature(rawBody, signature, timestamp, publicKeyHex);
  if (!ok) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let body: {
    type: number;
    data?: { custom_id?: string };
    member?: { user?: { id: string; username?: string } };
    user?: { id: string; username?: string };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }

  // Discord PING (verification)
  if (body.type === PING) {
    return NextResponse.json({ type: PONG });
  }

  if (body.type !== MESSAGE_COMPONENT) {
    return NextResponse.json({ type: PONG });
  }

  const customId = body.data?.custom_id ?? "";
  const parsed = parseRsvpCustomId(customId);
  if (!parsed) {
    return ephemeral("Unrecognised button.");
  }

  // Discord user: in a guild interaction it's `member.user`, in a DM it's `user`.
  const discordUserId = body.member?.user?.id ?? body.user?.id;
  if (!discordUserId) {
    return ephemeral("Could not identify your Discord account.");
  }

  const user = await findUserByDiscordId(discordUserId);
  if (!user) {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
    return ephemeral(
      `Your Discord account isn't linked to a CLS profile yet. ` +
        `Sign in once with Discord at ${baseUrl}/api/auth/signin and try again.`
    );
  }

  // Look up the league's rsvpMode + close window so we know whether to
  // upsert/toggle and whether the RSVP is still open.
  const round = await prisma.round.findUnique({
    where: { id: parsed.roundId },
    select: {
      startsAt: true,
      status: true,
      season: {
        select: {
          league: {
            select: { rsvpMode: true, rsvpCloseBeforeHours: true },
          },
        },
      },
    },
  });
  const mode = round?.season.league.rsvpMode ?? "FULL";

  // Hard block: if the RSVP is closed (race within close window, or round
  // not UPCOMING), reject the click and trigger a refresh so the embed
  // updates to show disabled buttons.
  if (
    round &&
    isRsvpClosed({
      startsAt: round.startsAt,
      status: round.status,
      rsvpCloseBeforeHours: round.season.league.rsvpCloseBeforeHours,
    })
  ) {
    after(async () => {
      try {
        await refreshDiscordRsvpMessage(parsed.roundId);
      } catch {
        /* swallow */
      }
    });
    return ephemeral(
      "Registration for this round is closed — RSVPs can no longer be changed."
    );
  }

  // DECLINE_ONLY: clicking Decline toggles. (Other buttons can't exist in
  // this mode because the embed only renders Decline, but we still defend.)
  if (mode === "DECLINE_ONLY") {
    if (parsed.status !== "DECLINED") {
      return ephemeral("Only the Decline button is active for this league.");
    }
    const t = await toggleDecline({
      roundId: parsed.roundId,
      userId: user.id,
      source: "DISCORD",
      skipRefresh: true, // run refresh in background after responding
    });
    if (!t.ok) {
      if (t.reason === "user-not-registered") {
        const baseUrl =
          process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
        return ephemeral(
          `You're not registered for this season yet. Sign up at ${baseUrl} ` +
            `— once you're registered you can RSVP for each round.`
        );
      }
      if (t.reason === "round-not-found") {
        return ephemeral("This round no longer exists.");
      }
      return ephemeral("Could not record your decline. Please try again later.");
    }
    // Run the embed refresh AFTER the response goes back to Discord, so we
    // stay inside the 3-second interaction deadline even on cold starts.
    after(async () => {
      try {
        await refreshDiscordRsvpMessage(parsed.roundId);
      } catch {
        /* swallow */
      }
      // Offer the freed slot to the next waiting-list driver (no-op uncapped).
      try {
        await reconcileFillInsForRound(parsed.roundId);
      } catch {
        /* swallow */
      }
    });
    const verb =
      t.action === "added"
        ? "❌ Decline recorded — you won't be on the grid."
        : "✅ Decline removed — you're back on the grid.";
    return NextResponse.json({
      type: CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `${verb} (${driverDisplayName(user)})`, flags: EPHEMERAL },
    });
  }

  // FULL mode (default): upsert any of the three statuses.
  const result = await upsertRsvp({
    roundId: parsed.roundId,
    userId: user.id,
    status: parsed.status,
    source: "DISCORD",
    skipRefresh: true, // run refresh in background after responding
  });

  if (!result.ok) {
    if (result.reason === "user-not-registered") {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      return ephemeral(
        `You're not registered for this season yet. ` +
          `Sign up at ${baseUrl} — once you're registered you can RSVP for each round.`
      );
    }
    if (result.reason === "round-not-found") {
      return ephemeral("This round no longer exists.");
    }
    return ephemeral("Could not record your RSVP. Please try again later.");
  }

  after(async () => {
    try {
      await refreshDiscordRsvpMessage(parsed.roundId);
    } catch {
      /* swallow */
    }
    try {
      await reconcileFillInsForRound(parsed.roundId);
    } catch {
      /* swallow */
    }
  });

  const label =
    result.status === "ACCEPTED"
      ? "✅ Accepted"
      : result.status === "DECLINED"
      ? "❌ Declined"
      : "❔ Tentative";

  return NextResponse.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `${label} — RSVP recorded for ${driverDisplayName(user)}.`,
      flags: EPHEMERAL,
    },
  });
}
