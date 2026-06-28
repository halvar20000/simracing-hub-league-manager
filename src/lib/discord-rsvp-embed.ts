/**
 * Builds the Discord embed + button row for a round's RSVP message.
 *
 * Shared by:
 *   - the initial post (notify-rsvp.ts)
 *   - every live edit when a driver clicks a button (rsvp.ts:refreshDiscordRsvpMessage)
 *
 * One canonical shape avoids drift between the initial post and the edits.
 */

import type { Embed, MessagePayload } from "@/lib/discord-bot";
import type { RsvpStatus, RsvpMode } from "@prisma/client";
import { discordTimestamp } from "@/lib/timezone";

// Discord component types
const ROW = 1;
const BUTTON = 2;

// Button styles
const BTN_SUCCESS = 3; // green — Accept
const BTN_DANGER = 4; // red   — Decline
const BTN_SECONDARY = 2; // grey  — Tentative

export type RsvpDriverSummary = {
  registrationId: string;
  displayName: string;
  status: RsvpStatus;
};

export type RsvpEmbedInput = {
  leagueName: string;
  leagueLogoUrl?: string | null;   // resolved to an absolute URL by the caller, or null
  seasonLabel: string;             // e.g. "2026 Season 1"
  roundNumber: number;
  roundName: string;
  track: string;
  trackConfig?: string | null;
  startsAt: Date;
  roundUrl: string;                // deep link to league-manager round page
  drivers: RsvpDriverSummary[];    // current state (used for tallies + name lists)
  totalRegistered?: number;        // used in DECLINE_ONLY mode to compute "expected on grid"
  maxDrivers?: number | null;      // optional grid cap; appended to the tally line when set
  rsvpMode?: RsvpMode;             // default FULL
  closed?: boolean;                // when true, render disabled buttons + "Closed"
  embedColor?: string | null;      // hex like "#EB459E" or "EB459E"; defaults to orange
};

const DEFAULT_EMBED_COLOR = 0xff6b35; // orange

/**
 * Parse a hex color string into an integer for Discord's `color` field.
 * Accepts "#EB459E", "EB459E", or "eb459e". Returns the default orange when
 * input is missing or malformed.
 */
function parseEmbedColor(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return DEFAULT_EMBED_COLOR;
  const n = parseInt(cleaned, 16);
  return Number.isFinite(n) ? n : DEFAULT_EMBED_COLOR;
}

/**
 * Discord requires absolute URLs in embeds. If the stored logoUrl is
 * relative (e.g. "/logos/foo.png"), prefix it with NEXT_PUBLIC_SITE_URL.
 * Returns null when the input is empty so callers can omit the thumbnail.
 */
export function resolveLogoUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  return `${base.replace(/\/$/, "")}${stored.startsWith("/") ? "" : "/"}${stored}`;
}

const CUSTOM_ID_PREFIX = "rsvp"; // custom_id = "rsvp:<roundId>:<status>"

export function rsvpCustomId(roundId: string, status: RsvpStatus): string {
  return `${CUSTOM_ID_PREFIX}:${roundId}:${status}`;
}

export function parseRsvpCustomId(
  customId: string
): { roundId: string; status: RsvpStatus } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== CUSTOM_ID_PREFIX) return null;
  const status = parts[2];
  if (status !== "ACCEPTED" && status !== "DECLINED" && status !== "TENTATIVE") return null;
  return { roundId: parts[1], status: status as RsvpStatus };
}

// ── Waiting-list fill-in offer buttons ─────────────────────────────────────
// The offer DM sent to the next waiting-list driver when a confirmed driver
// declines a round carries its own Accept / Decline buttons, distinct from the
// public RSVP embed's buttons. custom_id = "fillin:<roundId>:<ACCEPT|DECLINE>".

const FILLIN_ID_PREFIX = "fillin";

export type FillInAction = "ACCEPT" | "DECLINE";

export function fillInCustomId(roundId: string, action: FillInAction): string {
  return `${FILLIN_ID_PREFIX}:${roundId}:${action}`;
}

export function parseFillInCustomId(
  customId: string
): { roundId: string; action: FillInAction } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== FILLIN_ID_PREFIX) return null;
  const action = parts[2];
  if (action !== "ACCEPT" && action !== "DECLINE") return null;
  return { roundId: parts[1], action: action as FillInAction };
}

/**
 * Build the Accept / Decline button row for a fill-in offer DM. Returns the
 * `components` array for a MessagePayload (the caller supplies `content`).
 */
export function buildFillInOfferComponents(roundId: string): MessagePayload["components"] {
  return [
    {
      type: ROW,
      components: [
        {
          type: BUTTON,
          style: BTN_SUCCESS,
          label: "Accept this race",
          emoji: { name: "🏁" },
          custom_id: fillInCustomId(roundId, "ACCEPT"),
        },
        {
          type: BUTTON,
          style: BTN_DANGER,
          label: "Can't make it",
          emoji: { name: "❌" },
          custom_id: fillInCustomId(roundId, "DECLINE"),
        },
      ],
    },
  ];
}

function bulletList(names: string[], limit = 25): string {
  if (names.length === 0) return "_no responses yet_";
  const shown = names.slice(0, limit);
  let body = shown.map((n) => `• ${n}`).join("\n");
  if (names.length > limit) {
    body += `\n…and ${names.length - limit} more`;
  }
  return body;
}

export function buildRsvpEmbed(input: RsvpEmbedInput, roundId: string): MessagePayload {
  // discordTimestamp() corrects the wall-clock-stored-as-UTC quirk so
  // <t:…> renders the right local time on Discord — see src/lib/timezone.ts.
  const ts = discordTimestamp(input.startsAt);
  const trackLine = input.trackConfig
    ? `${input.track} — ${input.trackConfig}`
    : input.track;

  const description =
    `**${input.seasonLabel}** · Round ${input.roundNumber}: **${input.roundName}**\n` +
    `📍 ${trackLine}\n` +
    `🕐 <t:${ts}:F> (<t:${ts}:R>)`;

  if (input.rsvpMode === "DECLINE_ONLY") {
    return buildDeclineOnlyPayload(input, roundId, description);
  }

  return buildFullPayload(input, roundId, description);
}

function buildFullPayload(
  input: RsvpEmbedInput,
  roundId: string,
  description: string
): MessagePayload {
  const accepted = input.drivers.filter((d) => d.status === "ACCEPTED");
  const declined = input.drivers.filter((d) => d.status === "DECLINED");
  const tentative = input.drivers.filter((d) => d.status === "TENTATIVE");

  const tally =
    `✅ **${accepted.length}** · ❌ **${declined.length}** · ❔ **${tentative.length}**`;

  const fields: Embed["fields"] = [
    { name: "Tally", value: tally, inline: false },
    { name: `✅ Accepted (${accepted.length})`, value: bulletList(accepted.map((d) => d.displayName)), inline: true },
    { name: `❌ Declined (${declined.length})`, value: bulletList(declined.map((d) => d.displayName)), inline: true },
    { name: `❔ Tentative (${tentative.length})`, value: bulletList(tentative.map((d) => d.displayName)), inline: true },
  ];

  const embed: Embed = {
    title: `🏁 RSVP — ${input.leagueName}`,
    description,
    url: input.roundUrl,
    color: parseEmbedColor(input.embedColor),
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: input.closed
        ? "Registration closed"
        : "Click below to RSVP — you can change your mind any time before the race.",
    },
    ...(input.leagueLogoUrl ? { image: { url: input.leagueLogoUrl } } : {}),
  };

  const buttons = [
    { type: BUTTON, style: BTN_SUCCESS, label: "Accept", emoji: { name: "✅" }, custom_id: rsvpCustomId(roundId, "ACCEPTED"), disabled: !!input.closed },
    { type: BUTTON, style: BTN_DANGER, label: "Decline", emoji: { name: "❌" }, custom_id: rsvpCustomId(roundId, "DECLINED"), disabled: !!input.closed },
    { type: BUTTON, style: BTN_SECONDARY, label: "Tentative", emoji: { name: "❔" }, custom_id: rsvpCustomId(roundId, "TENTATIVE"), disabled: !!input.closed },
  ];

  return { embeds: [embed], components: [{ type: ROW, components: buttons }] };
}

function buildDeclineOnlyPayload(
  input: RsvpEmbedInput,
  roundId: string,
  description: string
): MessagePayload {
  const declined = input.drivers.filter((d) => d.status === "DECLINED");
  const total = input.totalRegistered ?? 0;
  // "Expected on grid" = registered drivers minus declines. Only meaningful
  // when we know the total.
  const expectedOnGrid = total > 0 ? Math.max(0, total - declined.length) : null;

  const maxSuffix =
    typeof input.maxDrivers === "number" && input.maxDrivers > 0
      ? `, max. ${input.maxDrivers} drivers can register`
      : "";
  const tally =
    expectedOnGrid !== null
      ? `❌ **${declined.length}** declined · 🏁 **${expectedOnGrid}** expected on the grid (of ${total} registered)${maxSuffix}`
      : `❌ **${declined.length}** declined`;

  const fields: Embed["fields"] = [
    { name: "Tally", value: tally, inline: false },
    {
      name: `❌ Declined (${declined.length})`,
      value: bulletList(declined.map((d) => d.displayName)),
      inline: false,
    },
  ];

  const embed: Embed = {
    title: `🏁 Race attendance — ${input.leagueName}`,
    description:
      description +
      `\n\n` +
      `**Click Decline only if you CAN'T race.** All other drivers are assumed to be on the grid.` +
      (input.closed ? "" : ` Clicking Decline again removes it.`),
    url: input.roundUrl,
    color: parseEmbedColor(input.embedColor),
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: input.closed
        ? "Registration closed"
        : "No-shows without a Decline incur a penalty point.",
    },
    ...(input.leagueLogoUrl ? { image: { url: input.leagueLogoUrl } } : {}),
  };

  const buttons = [
    {
      type: BUTTON,
      style: BTN_DANGER,
      label: "Decline (I can't race)",
      emoji: { name: "❌" },
      custom_id: rsvpCustomId(roundId, "DECLINED"),
      disabled: !!input.closed,
    },
  ];

  return { embeds: [embed], components: [{ type: ROW, components: buttons }] };
}
