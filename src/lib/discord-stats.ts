/**
 * Discord community statistics builder.
 *
 * Two products, both fed by scanning the bot-readable channels:
 *   1. buildDiscordStats() — a 30-day snapshot: per-member chat / league /
 *      join activity joined with CLS data. Drives the /admin/discord-stats
 *      headline tiles + member table.
 *   2. buildMonthlyActivity() — per-month message + active-member tallies for
 *      the long-range trend chart. Past months are immutable once scanned, so
 *      the heavy 24-month scan is a one-time backfill; the daily refresh only
 *      rewrites the current month.
 *
 * Scanning message history is slow — never call these during a page render.
 * The daily cron and the admin "Refresh" button drive buildDiscordStats via
 * saveDiscordStatsSnapshot(); the backfill script drives buildMonthlyActivity.
 *
 * Not a "use server" module — imported by the cron route, the action and the
 * backfill script.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const DISCORD_API = "https://discord.com/api/v10";
const WINDOW_DAYS = 30;
/** Time budget for the 30-day snapshot scan so a refresh never runs away. */
const SNAPSHOT_BUDGET_MS = 45_000;
/** Generous budget for the one-time backfill (runs as a script, no timeout). */
const BACKFILL_BUDGET_MS = 9 * 60_000;

export type DiscordMemberStat = {
  discordId: string;
  name: string;
  joinedAt: string | null;
  joinedInWindow: boolean;
  messages: number;
  chatActive: boolean;
  linked: boolean;
  clsName: string | null;
  registered: boolean;
  leagueActive: boolean;
};

export type MonthlyRow = {
  /** "YYYY-MM" */
  month: string;
  messageCount: number;
  activeMembers: number;
};

type ScanInfo = {
  channelsScanned: number;
  channelsSkipped: number;
  messagesScanned: number;
  partial: boolean;
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
  scan: ScanInfo;
  /** This calendar month's running tally — fed into the trend table. */
  currentMonth: MonthlyRow;
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

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

async function resolveGuilds(): Promise<
  { token: string; guildIds: string[] } | { error: string }
> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { error: "DISCORD_BOT_TOKEN is not configured on the server." };
  const leagues = await prisma.league.findMany({
    where: { discordGuildId: { not: null } },
    select: { discordGuildId: true },
  });
  const guildIds = [
    ...new Set(leagues.map((l) => l.discordGuildId!).filter(Boolean)),
  ];
  if (guildIds.length === 0) {
    return { error: "No Discord guild ID is configured on any league." };
  }
  return { token, guildIds };
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

/**
 * Page back through one channel's messages until older than `since`, invoking
 * `onMessage` for each non-bot message. Returns `ok: false` when the bot
 * can't read the channel (403/404) so the caller can count it as skipped.
 */
async function scanChannelMessages(
  channelId: string,
  token: string,
  since: Date,
  deadline: number,
  onMessage: (authorId: string, ts: Date) => void
): Promise<{ scanned: number; ok: boolean }> {
  let before: string | null = null;
  let scanned = 0;
  for (;;) {
    if (Date.now() > deadline) return { scanned, ok: true };
    const url =
      `${DISCORD_API}/channels/${channelId}/messages?limit=100` +
      (before ? `&before=${before}` : "");
    const res = await fetch(url, { headers: botHeaders(token) });
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
      // Messages are newest-first; the first one older than `since` means
      // every remaining message is older too.
      const ts = new Date(m.timestamp);
      if (ts < since) {
        reachedCutoff = true;
        break;
      }
      scanned++;
      if (m.author && !m.author.bot) onMessage(m.author.id, ts);
    }
    if (reachedCutoff || msgs.length < 100) return { scanned, ok: true };
    before = msgs[msgs.length - 1].id;
  }
}

/** Scan every readable text channel of every guild, back to `since`. */
async function scanAllChannels(
  guildIds: string[],
  token: string,
  since: Date,
  budgetMs: number,
  onMessage: (authorId: string, ts: Date) => void,
  errors: string[]
): Promise<ScanInfo> {
  const deadline = Date.now() + budgetMs;
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
      const r = await scanChannelMessages(ch.id, token, since, deadline, onMessage);
      messagesScanned += r.scanned;
      if (r.ok) channelsScanned++;
      else channelsSkipped++;
    }
    if (partial) break;
  }
  if (Date.now() > deadline) partial = true;
  return { channelsScanned, channelsSkipped, messagesScanned, partial };
}

export async function buildDiscordStats(): Promise<DiscordStatsData> {
  const errors: string[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const curMonth = monthKey(now);

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
    currentMonth: { month: curMonth, messageCount: 0, activeMembers: 0 },
    members: [],
    errors,
  });

  const ctx = await resolveGuilds();
  if ("error" in ctx) {
    errors.push(ctx.error);
    return empty();
  }
  const { token, guildIds } = ctx;

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

  // 2. Message scan — last 30 days. A 30-day scan always fully covers the
  //    current calendar month, so the current-month trend bucket is taken
  //    from the same pass.
  const msgCounts = new Map<string, number>();
  const curMonthAuthors = new Set<string>();
  let curMonthMessages = 0;
  const scan = await scanAllChannels(
    guildIds,
    token,
    cutoff,
    SNAPSHOT_BUDGET_MS,
    (authorId, ts) => {
      msgCounts.set(authorId, (msgCounts.get(authorId) ?? 0) + 1);
      if (monthKey(ts) === curMonth) {
        curMonthMessages++;
        curMonthAuthors.add(authorId);
      }
    },
    errors
  );

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
    members.push({
      discordId,
      name,
      joinedAt,
      joinedInWindow,
      messages,
      chatActive: messages > 0,
      linked: userId != null,
      clsName: userId ? userName.get(userId) ?? null : null,
      registered: userId != null && registeredUserIds.has(userId),
      leagueActive: userId != null && leagueActiveUserIds.has(userId),
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
    scan,
    currentMonth: {
      month: curMonth,
      messageCount: curMonthMessages,
      activeMembers: curMonthAuthors.size,
    },
    members,
    errors,
  };
}

/**
 * Scan `monthsBack` calendar months of message history and tally messages +
 * distinct active members per month. Used by the one-time backfill script.
 */
export async function buildMonthlyActivity(monthsBack: number): Promise<{
  rows: MonthlyRow[];
  scan: ScanInfo;
  errors: string[];
}> {
  const errors: string[] = [];
  const ctx = await resolveGuilds();
  if ("error" in ctx) {
    errors.push(ctx.error);
    return {
      rows: [],
      scan: { channelsScanned: 0, channelsSkipped: 0, messagesScanned: 0, partial: false },
      errors,
    };
  }
  const { token, guildIds } = ctx;

  const now = new Date();
  // First day of the month `monthsBack - 1` months before the current one.
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1)
  );

  const monthly = new Map<string, { messages: number; authors: Set<string> }>();
  const scan = await scanAllChannels(
    guildIds,
    token,
    since,
    BACKFILL_BUDGET_MS,
    (authorId, ts) => {
      const key = monthKey(ts);
      let b = monthly.get(key);
      if (!b) {
        b = { messages: 0, authors: new Set() };
        monthly.set(key, b);
      }
      b.messages++;
      b.authors.add(authorId);
    },
    errors
  );

  const rows: MonthlyRow[] = [...monthly.entries()]
    .map(([month, b]) => ({
      month,
      messageCount: b.messages,
      activeMembers: b.authors.size,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { rows, scan, errors };
}

/** Upsert monthly trend rows (idempotent — safe to re-run). */
export async function saveMonthlyActivity(rows: MonthlyRow[]): Promise<void> {
  for (const r of rows) {
    await prisma.discordMonthlyActivity.upsert({
      where: { month: r.month },
      create: {
        month: r.month,
        messageCount: r.messageCount,
        activeMembers: r.activeMembers,
      },
      update: { messageCount: r.messageCount, activeMembers: r.activeMembers },
    });
  }
}

/**
 * Build a fresh 30-day snapshot, persist it, and refresh the current month's
 * trend bucket. Shared by the daily cron and the admin "Refresh" action.
 *
 * The current-month bucket is only written when the scan completed in full —
 * a partial scan would undercount and must not overwrite a good value.
 */
export async function saveDiscordStatsSnapshot(): Promise<DiscordStatsData> {
  const data = await buildDiscordStats();
  await prisma.discordStatsSnapshot.create({
    // DiscordStatsData is plain JSON-serialisable data; Prisma's Json input
    // type doesn't accept a typed interface directly, hence the cast.
    data: { data: data as unknown as Prisma.InputJsonValue },
  });
  if (!data.scan.partial) {
    const cm = data.currentMonth;
    await prisma.discordMonthlyActivity.upsert({
      where: { month: cm.month },
      create: {
        month: cm.month,
        messageCount: cm.messageCount,
        activeMembers: cm.activeMembers,
      },
      update: { messageCount: cm.messageCount, activeMembers: cm.activeMembers },
    });
  }
  return data;
}
