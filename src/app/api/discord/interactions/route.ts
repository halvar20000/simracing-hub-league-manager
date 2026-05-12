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

import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import {
  findUserByDiscordId,
  upsertRsvp,
  driverDisplayName,
} from "@/lib/rsvp";
import { parseRsvpCustomId } from "@/lib/discord-rsvp-embed";

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

  const result = await upsertRsvp({
    roundId: parsed.roundId,
    userId: user.id,
    status: parsed.status,
    source: "DISCORD",
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

  const label =
    result.status === "ACCEPTED"
      ? "✅ Accepted"
      : result.status === "DECLINED"
      ? "❌ Declined"
      : "❔ Tentative";

  // Reply ephemerally to the clicker; the original message is edited
  // separately by upsertRsvp → refreshDiscordRsvpMessage.
  return NextResponse.json({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `${label} — RSVP recorded for ${driverDisplayName(user)}.`,
      flags: EPHEMERAL,
    },
  });
}
