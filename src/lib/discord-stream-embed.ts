/**
 * Discord embed for a per-round Twitch stream announcement.
 *
 * Shape: a single embed with the configured league color, the round
 * banner / poster image (Vercel Blob URL), the scheduled-stream time as
 * a Discord native timestamp, plus an optional "Watch on Twitch" link
 * button. Posted by the existing CLS bot via discord-bot.ts.
 */

import type { MessagePayload } from "@/lib/discord-bot";
import { discordTimestamp } from "@/lib/timezone";

export type StreamEmbedInput = {
  leagueName: string;
  leagueLogoUrl?: string | null;
  seasonLabel: string;          // e.g. "2026 13th Season"
  roundNumber: number;
  roundName: string;
  track: string;
  trackConfig?: string | null;
  startsAt: Date;               // race start (for "the race is at …")
  scheduledStreamAt: Date;      // when the stream goes live
  twitchUrl?: string | null;
  posterImageUrl?: string | null;
  messageText?: string | null;  // optional custom body
  embedColor?: string | null;   // hex; falls back to purple/twitch-ish
};

const DEFAULT_STREAM_COLOR = 0x9146ff; // Twitch purple

function parseEmbedColor(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_STREAM_COLOR;
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return DEFAULT_STREAM_COLOR;
  const n = parseInt(cleaned, 16);
  return Number.isFinite(n) ? n : DEFAULT_STREAM_COLOR;
}

export function buildStreamEmbed(input: StreamEmbedInput): MessagePayload {
  // discordTimestamp() corrects the wall-clock-stored-as-UTC quirk so
  // <t:…> renders the right local time on Discord — see src/lib/timezone.ts.
  const streamTs = discordTimestamp(input.scheduledStreamAt);
  const raceTs = discordTimestamp(input.startsAt);
  const trackLine = input.trackConfig
    ? `${input.track} — ${input.trackConfig}`
    : input.track;

  const lines: string[] = [
    `**${input.seasonLabel}** · Round ${input.roundNumber}: **${input.roundName}**`,
    `📍 ${trackLine}`,
    `🏁 Race: <t:${raceTs}:F>`,
    `📺 Stream live: <t:${streamTs}:F> (<t:${streamTs}:R>)`,
  ];
  if (input.messageText && input.messageText.trim().length > 0) {
    lines.push("", input.messageText.trim());
  }

  // Discord renders a "button" inside an embed only via the
  // components array; the embed itself can carry a clickable URL on
  // the title. Use both: title link → Twitch, plus a real button row.
  const payload: MessagePayload = {
    embeds: [
      {
        title: `📡 ${input.leagueName} — Live Stream`,
        url: input.twitchUrl ?? undefined,
        description: lines.join("\n"),
        color: parseEmbedColor(input.embedColor),
        ...(input.posterImageUrl
          ? { image: { url: input.posterImageUrl } }
          : {}),
        ...(input.leagueLogoUrl
          ? { thumbnail: { url: input.leagueLogoUrl } }
          : {}),
        footer: {
          text: input.twitchUrl
            ? "Click the title to open the Twitch channel."
            : "Stream channel TBA",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  if (input.twitchUrl) {
    payload.components = [
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 5, // Link
            label: "Watch on Twitch",
            url: input.twitchUrl,
            emoji: { name: "📺" },
          },
        ],
      },
    ];
  }

  return payload;
}
