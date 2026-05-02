/**
 * Fire-and-forget Discord webhook poster. Never throws — registration must
 * still complete even if Discord is down.
 */
export async function postDiscordWebhook(
  url: string,
  payload: {
    username?: string;
    avatar_url?: string;
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      timestamp?: string;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
    }>;
  }
): Promise<{ ok: boolean; status: number; body?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = res.ok ? "" : await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}
