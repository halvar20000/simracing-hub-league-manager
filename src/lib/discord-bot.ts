/**
 * Discord bot REST helpers — authenticated calls using DISCORD_BOT_TOKEN.
 *
 * Distinct from src/lib/discord-webhook.ts (anonymous webhook posts). The bot
 * token lets us:
 *   - post messages we can later edit/delete
 *   - send interaction callbacks (button click responses)
 *   - mention users by Discord ID
 *
 * All helpers return { ok, status, body } and never throw — caller decides
 * whether a Discord outage is fatal.
 */

const DISCORD_API = "https://discord.com/api/v10";

type Component = {
  type: number;
  components?: Component[];
  custom_id?: string;
  label?: string;
  style?: number;
  emoji?: { name: string };
  disabled?: boolean;
};

export type EmbedField = { name: string; value: string; inline?: boolean };

export type Embed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  fields?: EmbedField[];
  footer?: { text: string };
  thumbnail?: { url: string };
  image?: { url: string };
};

export type MessagePayload = {
  content?: string;
  embeds?: Embed[];
  components?: Component[];
  allowed_mentions?: { users?: string[]; parse?: string[] };
};

type Result<T = unknown> = { ok: true; data: T } | { ok: false; status: number; body: string };

function botToken(): string | null {
  const t = process.env.DISCORD_BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

async function discordFetch<T>(
  path: string,
  init: RequestInit
): Promise<Result<T>> {
  const token = botToken();
  if (!token) return { ok: false, status: 0, body: "missing-DISCORD_BOT_TOKEN" };

  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: text };
    if (!text) return { ok: true, data: undefined as unknown as T };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

export async function postBotMessage(
  channelId: string,
  payload: MessagePayload
): Promise<Result<{ id: string; channel_id: string }>> {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function editBotMessage(
  channelId: string,
  messageId: string,
  payload: MessagePayload
): Promise<Result<{ id: string }>> {
  return discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteBotMessage(
  channelId: string,
  messageId: string
): Promise<Result<undefined>> {
  return discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  });
}

/**
 * Diagnostic: ask Discord "can the bot see this channel?".
 * Returns the channel object on success, or a structured error on failure.
 * Useful for admin debugging — surfaces the exact Discord error.
 */
export async function getChannelAsBot(
  channelId: string
): Promise<Result<{ id: string; name?: string; guild_id?: string; type?: number }>> {
  return discordFetch(`/channels/${channelId}`, { method: "GET" });
}
