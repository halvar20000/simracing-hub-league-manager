/**
 * Discord member flow: how many joined / left the CAS server per month.
 *
 * Source: the #moderation channel, which carries Discord's own join system
 * message (message type 7) for every new member and a RaceDirector bot line
 * "**name** just left the server" for every leave — since 2024-02-24.
 *
 * Stored in AppSetting `discord-member-flow` (no schema change): per-month
 * counts plus the newest message id already counted, so the daily refresh
 * only reads what is new. The first run reads the whole channel (~40 pages).
 * A run that does not finish within its budget saves nothing; the next one
 * tries again.
 *
 * Not "use server": called from saveDiscordStatsSnapshot (cron + admin button).
 */
import { prisma } from "@/lib/prisma";

export const MEMBER_LOG_CHANNEL_ID = "1075141203756073013";
export const MEMBER_FLOW_KEY = "discord-member-flow";
const DISCORD_API = "https://discord.com/api/v10";
const BUDGET_MS = 25_000;
const JOIN_TYPE = 7;
const LEFT_RE = /just left the server/i;

export type MemberFlowMonth = { joined: number; left: number };
export type MemberFlow = {
  months: Record<string, MemberFlowMonth>;
  lastMessageId: string | null;
  updatedAt: string | null;
};

type Msg = { id: string; type: number; timestamp: string; content?: string; author?: { bot?: boolean } };

export async function loadMemberFlow(): Promise<MemberFlow> {
  const row = await prisma.appSetting.findUnique({ where: { key: MEMBER_FLOW_KEY } });
  try {
    const v = row ? (JSON.parse(row.value) as Partial<MemberFlow>) : {};
    return { months: v.months ?? {}, lastMessageId: v.lastMessageId ?? null, updatedAt: v.updatedAt ?? null };
  } catch {
    return { months: {}, lastMessageId: null, updatedAt: null };
  }
}

/** Count new join/leave messages since the last run. Never throws. */
export async function refreshMemberFlow(): Promise<{ ok: boolean; counted: number; error?: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, counted: 0, error: "no bot token" };
  try {
    const flow = await loadMemberFlow();
    const stopAt = flow.lastMessageId ? BigInt(flow.lastMessageId) : null;
    const deadline = Date.now() + BUDGET_MS;
    const add: Record<string, MemberFlowMonth> = {};
    let newest: string | null = null;
    let before: string | null = null;
    let counted = 0;
    for (;;) {
      if (Date.now() > deadline) return { ok: false, counted: 0, error: "time budget" };
      const url = `${DISCORD_API}/channels/${MEMBER_LOG_CHANNEL_ID}/messages?limit=100${before ? `&before=${before}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((r) => setTimeout(r, (body.retry_after ?? 1) * 1000 + 200));
        continue;
      }
      if (!res.ok) return { ok: false, counted: 0, error: `HTTP ${res.status}` };
      const msgs = (await res.json()) as Msg[];
      if (msgs.length === 0) break;
      newest ??= msgs[0].id;
      let done = false;
      for (const m of msgs) {
        if (stopAt !== null && BigInt(m.id) <= stopAt) {
          done = true;
          break;
        }
        const kind =
          m.type === JOIN_TYPE ? "joined" : m.author?.bot && LEFT_RE.test(m.content ?? "") ? "left" : null;
        if (!kind) continue;
        const month = m.timestamp.slice(0, 7);
        const b = (add[month] ??= { joined: 0, left: 0 });
        b[kind]++;
        counted++;
      }
      if (done || msgs.length < 100) break;
      before = msgs[msgs.length - 1].id;
    }
    for (const [month, v] of Object.entries(add)) {
      const b = (flow.months[month] ??= { joined: 0, left: 0 });
      b.joined += v.joined;
      b.left += v.left;
    }
    const value: MemberFlow = {
      months: flow.months,
      lastMessageId: newest ?? flow.lastMessageId,
      updatedAt: new Date().toISOString(),
    };
    await prisma.appSetting.upsert({
      where: { key: MEMBER_FLOW_KEY },
      create: { key: MEMBER_FLOW_KEY, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    return { ok: true, counted };
  } catch (e) {
    return { ok: false, counted: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
