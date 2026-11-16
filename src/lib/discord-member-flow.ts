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
  /** Newest message already counted. */
  lastMessageId: string | null;
  /** Backfill cursor: older messages than this are still to be read;
   *  "done" once the start of the channel is reached. */
  backfillBefore: string | null;
  updatedAt: string | null;
};

type Msg = { id: string; type: number; timestamp: string; content?: string; author?: { bot?: boolean } };

const EMPTY: MemberFlow = { months: {}, lastMessageId: null, backfillBefore: null, updatedAt: null };

export async function loadMemberFlow(): Promise<MemberFlow> {
  const row = await prisma.appSetting.findUnique({ where: { key: MEMBER_FLOW_KEY } });
  try {
    const v = row ? (JSON.parse(row.value) as Partial<MemberFlow>) : {};
    return {
      months: v.months ?? {},
      lastMessageId: v.lastMessageId ?? null,
      backfillBefore: v.backfillBefore ?? null,
      updatedAt: v.updatedAt ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** One page of messages older than `before` (newest first), retrying on 429. */
async function page(token: string, before: string | null, deadline: number): Promise<Msg[] | null> {
  for (;;) {
    if (Date.now() > deadline) return null;
    const url = `${DISCORD_API}/channels/${MEMBER_LOG_CHANNEL_ID}/messages?limit=100${before ? `&before=${before}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, (body.retry_after ?? 1) * 1000 + 200));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Msg[];
  }
}

function count(flow: MemberFlow, m: Msg): boolean {
  const kind = m.type === JOIN_TYPE ? "joined" : m.author?.bot && LEFT_RE.test(m.content ?? "") ? "left" : null;
  if (!kind) return false;
  const b = (flow.months[m.timestamp.slice(0, 7)] ??= { joined: 0, left: 0 });
  b[kind]++;
  return true;
}

async function save(flow: MemberFlow) {
  flow.updatedAt = new Date().toISOString();
  const value = JSON.stringify(flow);
  await prisma.appSetting.upsert({
    where: { key: MEMBER_FLOW_KEY },
    create: { key: MEMBER_FLOW_KEY, value },
    update: { value },
  });
}

/**
 * Count new join/leave messages, then continue the backfill of older ones.
 * Progress is saved page by page, so a run that runs out of time just
 * leaves the rest to the next one. Never throws.
 */
export async function refreshMemberFlow(): Promise<{ ok: boolean; counted: number; done: boolean; error?: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, counted: 0, done: false, error: "no bot token" };
  let counted = 0;
  try {
    const flow = await loadMemberFlow();
    const deadline = Date.now() + BUDGET_MS;

    if (flow.lastMessageId) {
      // 1) New messages since the last run (usually one page). Counted into
      //    a copy and only kept when the gap was read completely.
      const stopAt = BigInt(flow.lastMessageId);
      const fresh: MemberFlow = { ...flow, months: JSON.parse(JSON.stringify(flow.months)) };
      let before: string | null = null;
      let newest: string | null = null;
      let complete = false;
      let n = 0;
      for (;;) {
        const msgs = await page(token, before, deadline);
        if (!msgs) break;
        newest ??= msgs[0]?.id ?? null;
        let reached = msgs.length < 100;
        for (const m of msgs) {
          if (BigInt(m.id) <= stopAt) {
            reached = true;
            break;
          }
          if (count(fresh, m)) n++;
        }
        if (reached) {
          complete = true;
          break;
        }
        before = msgs[msgs.length - 1].id;
      }
      if (complete) {
        flow.months = fresh.months;
        if (newest) flow.lastMessageId = newest;
        counted += n;
      }
    }

    // 2) Backfill older messages (the first run starts at the newest).
    while (flow.backfillBefore !== "done") {
      const msgs = await page(token, flow.backfillBefore, deadline);
      if (!msgs) break;
      if (!flow.lastMessageId) flow.lastMessageId = msgs[0]?.id ?? null;
      for (const m of msgs) if (count(flow, m)) counted++;
      flow.backfillBefore = msgs.length < 100 ? "done" : msgs[msgs.length - 1].id;
      await save(flow);
    }
    await save(flow);
    return { ok: true, counted, done: flow.backfillBefore === "done" };
  } catch (e) {
    return { ok: false, counted, done: false, error: e instanceof Error ? e.message : String(e) };
  }
}
