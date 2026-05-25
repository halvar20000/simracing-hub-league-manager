/**
 * Discord community statistics builder.
 *
 * buildDiscordStats() fetches the CAS Discord server's member list and recent
 * message history via the bot REST API, joins it against CLS data
 * (registrations, race results, RSVPs), and returns a snapshot describing how
 * active each member has been over the last 30 days.
 *
 * It is slow — it scans channel message history — so it must NEVER be called
 * during a page render. It is driven by the daily cron and the admin
 * "Refresh" button, both of which persist the result to the
 * DiscordStatsSnapshot table; the admin page only reads that table.
 *
 * Not a "use server" module — imported by the cron route and the action.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const DISCORD_API = "https://discord.com/api/v10";
const WINDOW_DAYS = 30;
/** Stop scanning message history after this long so a refresh never runs away. */
const SCAN_BUDGET_MS = 45_000;

export type DiscordMemberStat = {
  discordId: string;
  /** Best display name (global name, nickname or username). */
  name: string;
  joinedAt: string | null;
  joinedInWindow: boolean;
  /** Messages posted in the window. */
  messages: number;
  chatActive: boolean;
  /** Linked to a CLS user (Discord login or admin-set ID). */
  linked: boolean;
  clsName: string | null;
  /** Linked AND has at least one registration. */
  registered: boolean;
  /** Raced or RSVP'd in the window. */
  leagueActive: boolean;
};

export type DiscordStatsData = {
  generatedAt: string;
  windowDays: number;
  totals: {
    members: number;
    linked: number;
    registeredDrivers: number;
    chatActive: number;
    leagueActive: number;
    activeEither: number;
    joinedInWindow: number;
    lurkers: number;
  };
  scan: {
    channelsScanned: number;
    channelsSkipped: number;
    messagesScanned: number;
    /** True when the time budget was hit before every channel was scanned. */
    partial: boolean;
  };
  members: DiscordMemberStat[];
  errors: string[];
};

type GuildMember = {
  user?: {
    id: string;
    username?: string | null;
    global_name?: string | null;
    bot?: boolean;
  };
  nick?: string | null;
  joined_at?: string | null;
};

type GuildChannel = { id: string; name?: string | null; type: number };

type DiscordMessage = {
  id: string;
  timestamp: string;
  author?: { id: string; bot?: boolean };
};

function botHeaders(token: string) {
  return { Authorization: `Bot ${token}` };
}

async function fetchAllMembers(
  guildId: string,
  token: string
): Promise<GuildMember[]> {
  const out: GuildMember[] = [];
  let after = "0";
  for (;;) {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`,
      { headers: botHeaders(token) }
    );
    if (!res.ok) {
      throw new Error(
        `members HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`
      );
    }
    const batch = (await res.json()) as GuildMember[];
    out.push(...batch);
    if (batch.length < 1000) break;
    const last = batch[batch.length - 1]?.user?.id;
    if (!last) break;
    after = last;
  }
  return out;
}

async function fetchTextChannels(
  guildId: string,
  token: string
): Promise<GuildChannel[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: botHeaders(token),
  });
  if (!res.ok) throw new Error(`channels HTTP ${res.status}`);
  const all = (await res.json()) as GuildChannel[];
  // type 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT
  return all.filter((c) => c.type === 0 || c.type === 5);
}

/** Scan one channel's messages back to `cutoff`, tallying non-bot author ids. */
async function scanChannel(
  channelId: string,
  token: string,
  cutoff: Date,
  counts: Map<string, number>,
  deadline: number
): Promise<{ scanned: number; ok: boolean }> {
  let before: string | null = null;
  let scanned = 0;
  for (;;) {
    if (Date.now() > deadline) return { scanned, ok: true };
    const url =
      `${DISCORD_API}/channels/${channelId}/messages?limit=100` +
      (before ? `&before=${before}` : "");
    const res = await fetch(url, { headers: botHeaders(token) });
    // 403/404 — the bot can't read this channel; skip it.
    if (res.status === 403 || res.status === 404) return { scanned, ok: false };
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as {
        retry_after?: number;
      };
      await new Promise((r) => setTimeout(r, (body.retry_after ?? 1) * 1000));
      continue;
    }
    if (!res.ok) return { scanned, ok: false };
    const msgs = (await res.json()) as DiscordMessage[];
    if (msgs.length === 0) return { scanned, ok: true };
    let reachedCutoff = false;
    for (const m of msgs) {
      // Messages are newest-first; the first one older than the cutoff means
      // every remaining message is older too.
      if (new Date(m.timestamp) < cutoff) {
        reachedCutoff = true;
        break;
      }
      scanned++;
      if (m.author && !m.author.bot) {
        counts.set(m.author.id, (counts.get(m.author.id) ?? 0) + 1);
      }
    }
    if (reachedCutoff || msgs.length < 100) return { scanned, ok: true };
    before = msgs[msgs.length - 1].id;
  }
}

export async function buildDiscordStats(): Promise<DiscordStatsData> {
  const errors: string[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const empty = (): DiscordStatsData => ({
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    totals: {
      members: 0,
      linked: 0,
      registeredDrivers: 0,
      chatActive: 0,
      leagueActive: 0,
      activeEither: 0,
      joinedInWindow: 0,
      lurkers: 0,
    },
    scan: { channelsScanned: 0, channelsSkipped: 0, messagesScanned: 0, partial: false },
    members: [],
    errors,
  });

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    errors.push("DISCORD_BOT_TOKEN is not configured on the server.");
    return empty();
  }

  const leagues = await prisma.league.findMany({
    where: { discordGuildId: { not: null } },
    select: { discordGuildId: true },
  });
  const guildIds = [
    ...new Set(leagues.map((l) => l.discordGuildId!).filter(Boolean)),
  ];
  if (guildIds.length === 0) {
    errors.push("No Discord guild ID is configured on any league.");
    return empty();
  }

  // 1. Member list (bots excluded — they aren't community members).
  const memberById = new Map<string, GuildMember>();
  for (const gid of guildIds) {
    try {
      for (const m of await fetchAllMembers(gid, token)) {
        if (m.user?.id && !m.user.bot && !memberById.has(m.user.id)) {
          memberById.set(m.user.id, m);
        }
      }
    } catch (e) {
      errors.push(
        `Members for guild ${gid}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // 2. Message scan — every readable text channel, last 30 days, time-budgeted.
  const msgCounts = new Map<string, number>();
  const deadline = Date.now() + SCAN_BUDGET_MS;
  let channelsScanned = 0;
  let channelsSkipped = 0;
  let messagesScanned = 0;
  let partial = false;
  for (const gid of guildIds) {
    let channels: GuildChannel[] = [];
    try {
      channels = await fetchTextChannels(gid, token);
    } catch (e) {
      errors.push(
        `Channels for guild ${gid}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    for (const ch of channels) {
      if (Date.now() > deadline) {
        partial = true;
        break;
      }
      const r = await scanChannel(ch.id, token, cutoff, msgCounts, deadline);
      messagesScanned += r.scanned;
      if (r.ok) channelsScanned++;
      else channelsSkipped++;
    }
    if (partial) break;
  }
  if (Date.now() > deadline) partial = true;

  // 3. Join CLS data.
  const discordIds = [...memberById.keys()];

  const [accounts, usersByDiscordId] = await Promise.all([
    prisma.account.findMany({
      where: { provider: "discord", providerAccountId: { in: discordIds } },
      select: { providerAccountId: true, userId: true },
    }),
    prisma.user.findMany({
      where: { discordId: { in: discordIds } },
      select: { id: true, discordId: true },
    }),
  ]);

  const userIdByDiscordId = new Map<string, string>();
  for (const a of accounts) userIdByDiscordId.set(a.providerAccountId, a.userId);
  for (const u of usersByDiscordId) {
    if (u.discordId && !userIdByDiscordId.has(u.discordId)) {
      userIdByDiscordId.set(u.discordId, u.id);
    }
  }
  const linkedUserIds = [...new Set(userIdByDiscordId.values())];

  const [linkedUsers, regs, recentResults, recentRsvps] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: linkedUserIds } },
      select: { id: true, firstName: true, lastName: true, name: true },
    }),
    prisma.registration.findMany({
      where: { userId: { in: linkedUserIds } },
      select: { userId: true },
    }),
    prisma.raceResult.findMany({
      where: {
        registration: { userId: { in: linkedUserIds } },
        round: { startsAt: { gte: cutoff } },
      },
      select: { registration: { select: { userId: true } } },
    }),
    prisma.roundRsvp.findMany({
      where: {
        registration: { userId: { in: linkedUserIds } },
        respondedAt: { gte: cutoff },
      },
      select: { registration: { select: { userId: true } } },
    }),
  ]);

  const userName = new Map(
    linkedUsers.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || "—",
    ])
  );
  const registeredUserIds = new Set(regs.map((r) => r.userId));
  const leagueActiveUserIds = new Set<string>();
  for (const r of recentResults) leagueActiveUserIds.add(r.registration.userId);
  for (const r of recentRsvps) leagueActiveUserIds.add(r.registration.userId);

  // 4. Per-member rows.
  const members: DiscordMemberStat[] = [];
  for (const [discordId, m] of memberById) {
    const name =
      m.user?.global_name?.trim() ||
      m.nick?.trim() ||
      m.user?.username?.trim() ||
      discordId;
    const joinedAt = m.joined_at ?? null;
    const joinedInWindow = joinedAt ? new Date(joinedAt) >= cutoff : false;
    const messages = msgCounts.get(discordId) ?? 0;
    const userId = userIdByDiscordId.get(discordId) ?? null;
    const registered = userId != null && registeredUserIds.has(userId);
    const leagueActive = userId != null && leagueActiveUserIds.has(userId);
    members.push({
      discordId,
      name,
      joinedAt,
      joinedInWindow,
      messages,
      chatActive: messages > 0,
      linked: userId != null,
      clsName: userId ? userName.get(userId) ?? null : null,
      registered,
      leagueActive,
    });
  }
  members.sort((a, b) => b.messages - a.messages);

  const totals = {
    members: members.length,
    linked: members.filter((m) => m.linked).length,
    registeredDrivers: members.filter((m) => m.registered).length,
    chatActive: members.filter((m) => m.chatActive).length,
    leagueActive: members.filter((m) => m.leagueActive).length,
    activeEither: members.filter((m) => m.chatActive || m.leagueActive).length,
    joinedInWindow: members.filter((m) => m.joinedInWindow).length,
    lurkers: members.filter((m) => !m.chatActive && !m.leagueActive).length,
  };

  return {
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    totals,
    scan: { channelsScanned, channelsSkipped, messagesScanned, partial },
    members,
    errors,
  };
}

/**
 * Build a fresh snapshot and persist it to DiscordStatsSnapshot. Shared by the
 * daily cron and the admin "Refresh" action. Returns the snapshot it stored.
 */
export async function saveDiscordStatsSnapshot(): Promise<DiscordStatsData> {
  const data = await buildDiscordStats();
  await prisma.discordStatsSnapshot.create({
    // DiscordStatsData is plain JSON-serialisable data; Prisma's Json input
    // type doesn't accept a typed interface directly, hence the cast.
    data: { data: data as unknown as Prisma.InputJsonValue },
  });
  return data;
}

