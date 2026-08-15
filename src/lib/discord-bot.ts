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

export type Component = {
  type: number;
  components?: Component[];
  custom_id?: string;
  label?: string;
  style?: number;
  emoji?: { name: string };
  disabled?: boolean;
  /** Discord link buttons (style=5) require url instead of custom_id. */
  url?: string;
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
  allowed_mentions?: {
    users?: string[];
    roles?: string[];
    parse?: string[];
  };
};

type Result<T = unknown> = { ok: true; data: T } | { ok: false; status: number; body: string };

function botToken(): string | null {
  const t = process.env.DISCORD_BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

/** Discord's rate-limit payload: { message, retry_after (seconds), code }. */
function retryAfterMs(body: string): number | null {
  try {
    const j = JSON.parse(body) as { retry_after?: number };
    if (typeof j.retry_after !== "number") return null;
    // Only wait for short buckets — a multi-minute cooldown is the caller's
    // problem to report, not something to block a server action on.
    const ms = Math.ceil(j.retry_after * 1000) + 250;
    return ms > 0 && ms <= 8000 ? ms : null;
  } catch {
    return null;
  }
}

async function discordFetch<T>(
  path: string,
  init: RequestInit,
  attempt = 0
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
    if (!res.ok) {
      // 429 with a short retry_after: wait it out once or twice rather than
      // handing the admin an opaque failure. Editing a message older than an
      // hour has its own small bucket (error code 30046), which is easy to
      // exhaust by clicking "Refresh embed" a few times in a row.
      if (res.status === 429 && attempt < 2) {
        const waitMs = retryAfterMs(text);
        if (waitMs) {
          await new Promise((r) => setTimeout(r, waitMs));
          return discordFetch<T>(path, init, attempt + 1);
        }
      }
      return { ok: false, status: res.status, body: text };
    }
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

// ── Guild Scheduled Events ────────────────────────────────────────────────
// Server-level "events" that appear in the Events tab and trigger Discord's
// native start reminder (~15 min before). Bot needs the MANAGE_EVENTS perm.

export type GuildScheduledEvent = {
  id: string;
  guild_id: string;
  name: string;
  description?: string | null;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  /** 1 = STAGE_INSTANCE, 2 = VOICE, 3 = EXTERNAL */
  entity_type: number;
  /** 1 SCHEDULED, 2 ACTIVE, 3 COMPLETED, 4 CANCELED */
  status: number;
  entity_metadata?: { location?: string } | null;
};

/** Payload for an EXTERNAL scheduled event (location string, no channel). */
export type ExternalEventPayload = {
  name: string;
  description?: string;
  /** ISO8601 */
  scheduled_start_time: string;
  /** ISO8601 — required for EXTERNAL events. */
  scheduled_end_time: string;
  location: string;
  /** Cover image as a base64 data URI ("data:image/png;base64,…"). */
  image?: string;
};

/** List all (active + upcoming) scheduled events for a guild. */
export async function listGuildScheduledEvents(
  guildId: string
): Promise<Result<GuildScheduledEvent[]>> {
  return discordFetch(`/guilds/${guildId}/scheduled-events`, { method: "GET" });
}

/** Create an EXTERNAL scheduled event (privacy GUILD_ONLY). */
export async function createGuildScheduledEvent(
  guildId: string,
  payload: ExternalEventPayload
): Promise<Result<GuildScheduledEvent>> {
  return discordFetch(`/guilds/${guildId}/scheduled-events`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      scheduled_start_time: payload.scheduled_start_time,
      scheduled_end_time: payload.scheduled_end_time,
      privacy_level: 2, // GUILD_ONLY (only valid value)
      entity_type: 3, // EXTERNAL (1=STAGE_INSTANCE, 2=VOICE, 3=EXTERNAL)
      entity_metadata: { location: payload.location },
      ...(payload.image ? { image: payload.image } : {}),
    }),
  });
}

/** Update an existing scheduled event (e.g. when a round is rescheduled). */
export async function modifyGuildScheduledEvent(
  guildId: string,
  eventId: string,
  payload: Partial<ExternalEventPayload>
): Promise<Result<GuildScheduledEvent>> {
  const body: Record<string, unknown> = {};
  if (payload.name != null) body.name = payload.name;
  if (payload.description != null) body.description = payload.description;
  if (payload.scheduled_start_time != null)
    body.scheduled_start_time = payload.scheduled_start_time;
  if (payload.scheduled_end_time != null)
    body.scheduled_end_time = payload.scheduled_end_time;
  if (payload.location != null)
    body.entity_metadata = { location: payload.location };
  if (payload.image != null) body.image = payload.image;
  return discordFetch(`/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Open (or fetch the existing) DM channel between the bot and a user.
 * Discord returns the same channel on repeated calls, so this is idempotent.
 */
export async function openDmChannel(
  discordUserId: string
): Promise<Result<{ id: string }>> {
  return discordFetch(`/users/@me/channels`, {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
}

/**
 * Send a direct message to a Discord user by their Discord ID. Opens the DM
 * channel first, then posts. Returns the same Result shape as postBotMessage.
 * Never throws. Common failure: the user shares no guild with the bot or has
 * DMs disabled (Discord 403) — the caller decides how to surface that.
 */
export async function sendDirectMessage(
  discordUserId: string,
  payload: MessagePayload
): Promise<Result<{ id: string; channel_id: string }>> {
  const dm = await openDmChannel(discordUserId);
  if (!dm.ok) return dm;
  return postBotMessage(dm.data.id, payload);
}
