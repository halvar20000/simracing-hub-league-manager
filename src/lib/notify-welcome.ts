/**
 * Daily new-member welcome.
 *
 * The CLS bot is REST-only — it has no always-on gateway connection, so it
 * cannot react to "member joined" events live. Instead a daily cron calls
 * runWelcome(): it lists the guild's members, finds everyone who joined since
 * the last run (the League.discordWelcomeAfter watermark), and posts ONE
 * batched welcome message naming them — no @mention, so nobody is pinged.
 *
 * On first run after the feature is configured it just sets the watermark to
 * "now", so the server's existing members are never bulk-welcomed.
 *
 * Not a "use server" module — imported by the cron route.
 */

import { prisma } from "@/lib/prisma";
import { postBotMessage } from "@/lib/discord-bot";

const DISCORD_API = "https://discord.com/api/v10";

const DEFAULT_WELCOME =
  "Welcome to the CAS sim racing community, {names}! Great to have you " +
  "on board. Take a look around, and when you're ready to go racing check " +
  "out our leagues — and don't be shy, say hello.";

export type WelcomeResult = {
  ok: boolean;
  welcomed: number;
  reason?: string;
};

type GuildMember = {
  user?: { id: string; username?: string | null; global_name?: string | null; bot?: boolean };
  nick?: string | null;
  joined_at?: string | null;
};

async function fetchGuildMembers(
  guildId: string,
  token: string
): Promise<GuildMember[]> {
  const out: GuildMember[] = [];
  let after = "0";
  for (;;) {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${token}` } }
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

/** "A", "A and B", "A, B and C", "A, B, C and 4 more". */
function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length <= 8) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 8).join(", ")} and ${names.length - 8} more`;
}

export async function runWelcome(): Promise<WelcomeResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, welcomed: 0, reason: "no-bot-token" };

  // The welcome is server-wide; it hangs off whichever league has both a
  // guild ID and a welcome channel configured.
  const league = await prisma.league.findFirst({
    where: {
      discordWelcomeChannelId: { not: null },
      discordGuildId: { not: null },
    },
  });
  if (!league) return { ok: false, welcomed: 0, reason: "not-configured" };

  // First run after configuration — set the watermark and welcome nobody, so
  // the entire existing membership isn't greeted in one go.
  if (!league.discordWelcomeAfter) {
    await prisma.league.update({
      where: { id: league.id },
      data: { discordWelcomeAfter: new Date() },
    });
    return { ok: true, welcomed: 0, reason: "initialised" };
  }

  const after = league.discordWelcomeAfter;
  let members: GuildMember[];
  try {
    members = await fetchGuildMembers(league.discordGuildId!, token);
  } catch (e) {
    return {
      ok: false,
      welcomed: 0,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  const newbies = members
    .filter(
      (m) =>
        !m.user?.bot &&
        m.joined_at != null &&
        new Date(m.joined_at) > after
    )
    .sort(
      (a, b) =>
        new Date(a.joined_at!).getTime() - new Date(b.joined_at!).getTime()
    );

  if (newbies.length === 0) return { ok: true, welcomed: 0 };

  const names = newbies.map(
    (m) =>
      m.user?.global_name?.trim() ||
      m.nick?.trim() ||
      m.user?.username?.trim() ||
      "a new racer"
  );
  const template = league.discordWelcomeMessage?.trim() || DEFAULT_WELCOME;
  const namesStr = joinNames(names);
  const content = template.includes("{names}")
    ? template.replace("{names}", namesStr)
    : `${template}\n\n${namesStr}`;

  const res = await postBotMessage(league.discordWelcomeChannelId!, {
    content,
    // Names are plain text, never <@id> — but suppress all mentions anyway so
    // nobody is ever pinged by the welcome.
    allowed_mentions: { parse: [] },
  });
  if (!res.ok) {
    return { ok: false, welcomed: 0, reason: `post-failed-${res.status}` };
  }

  // Advance the watermark to the most recent join we just welcomed.
  const maxJoined = newbies.reduce(
    (mx, m) => {
      const t = new Date(m.joined_at!);
      return t > mx ? t : mx;
    },
    after as Date
  );
  await prisma.league.update({
    where: { id: league.id },
    data: { discordWelcomeAfter: maxJoined },
  });

  return { ok: true, welcomed: newbies.length };
}
