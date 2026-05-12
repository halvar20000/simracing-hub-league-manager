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
import type { RsvpStatus } from "@prisma/client";

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
  seasonLabel: string;             // e.g. "2026 Season 1"
  roundNumber: number;
  roundName: string;
  track: string;
  trackConfig?: string | null;
  startsAt: Date;
  roundUrl: string;                // deep link to league-manager round page
  drivers: RsvpDriverSummary[];    // current state (used for tallies + name lists)
  closed?: boolean;                // when true, render disabled buttons + "Closed"
};

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
  const accepted = input.drivers.filter((d) => d.status === "ACCEPTED");
  const declined = input.drivers.filter((d) => d.status === "DECLINED");
  const tentative = input.drivers.filter((d) => d.status === "TENTATIVE");

  // Discord renders unix timestamps in viewer's local TZ.
  // :F = "Tuesday, May 12, 2026 8:00 PM"
  // :R = relative ("in 3 days")
  const ts = Math.floor(input.startsAt.getTime() / 1000);
  const trackLine = input.trackConfig
    ? `${input.track} — ${input.trackConfig}`
    : input.track;

  const description =
    `**${input.seasonLabel}** · Round ${input.roundNumber}: **${input.roundName}**\n` +
    `📍 ${trackLine}\n` +
    `🕐 <t:${ts}:F> (<t:${ts}:R>)`;

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
    color: 0xff6b35, // brand orange
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: input.closed
        ? "Registration closed"
        : "Click below to RSVP — you can change your mind any time before the race.",
    },
  };

  const buttons = [
    {
      type: BUTTON,
      style: BTN_SUCCESS,
      label: "Accept",
      emoji: { name: "✅" },
      custom_id: rsvpCustomId(roundId, "ACCEPTED"),
      disabled: !!input.closed,
    },
    {
      type: BUTTON,
      style: BTN_DANGER,
      label: "Decline",
      emoji: { name: "❌" },
      custom_id: rsvpCustomId(roundId, "DECLINED"),
      disabled: !!input.closed,
    },
    {
      type: BUTTON,
      style: BTN_SECONDARY,
      label: "Tentative",
      emoji: { name: "❔" },
      custom_id: rsvpCustomId(roundId, "TENTATIVE"),
      disabled: !!input.closed,
    },
  ];

  return {
    embeds: [embed],
    components: [{ type: ROW, components: buttons }],
  };
}
