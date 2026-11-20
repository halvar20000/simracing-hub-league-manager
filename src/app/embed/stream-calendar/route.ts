/**
 * The public stream calendar as a stand-alone HTML page for an <iframe> on
 * other sites (no CLS navigation, no login, no cookies needed).
 *   <iframe src="https://league.simracing-hub.com/embed/stream-calendar">
 * ?theme=light for a light page. Same data as /streams/calendar.
 */
import { loadStreamCalendar } from "@/lib/stream-calendar-data";
import {
  STREAM_LEAGUES,
  STREAM_OPEN,
  streamDayLabel,
  streamerTwitchUrl,
  type StreamRace,
} from "@/lib/stream-calendar";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

function raceCell(r: StreamRace): string {
  const twitch = streamerTwitchUrl(r.streamer);
  const cls = r.planned ? " planned" : "";
  const title = r.publicHref
    ? `<a href="${esc(SITE + r.publicHref)}" target="_blank" rel="noopener">${esc(r.title)}</a>`
    : esc(r.title);
  const who = twitch
    ? `<a class="who on" href="${esc(twitch)}" target="_blank" rel="noopener">${esc(r.streamer)}</a>`
    : `<span class="who">${esc(r.streamer === STREAM_OPEN ? "Open" : r.streamer)}</span>`;
  return `<div class="race${cls}"><div class="when">${esc(streamDayLabel(r.date))} ${esc(r.time)}</div><div class="what" title="${esc(r.title)}">${title}</div>${who}</div>`;
}

export async function GET(req: Request) {
  const light = new URL(req.url).searchParams.get("theme") === "light";
  const calendar = await loadStreamCalendar();
  const weeks = calendar.weeks.filter((w) => !w.isPast);

  const head = STREAM_LEAGUES.map((l) => `<th>${esc(l.name)}</th>`).join("");
  const rows = weeks
    .map((w) => {
      const cells = STREAM_LEAGUES.map(
        (l) =>
          `<td>${w.races
            .filter((r) => r.leagueSlug === l.slug)
            .map(raceCell)
            .join("")}</td>`
      ).join("");
      const w13 = w.iracingWeek13 ? `<div class="w13">iRacing week 13</div>` : "";
      return `<tr><td class="wk"><b>KW ${w.isoWeek}</b><div class="sub">${esc(streamDayLabel(w.monday))}</div>${w13}</td>${cells}</tr>`;
    })
    .join("");

  const body = weeks.length
    ? `<div class="scroll"><table><thead><tr><th>Week</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="sub">No streamed races planned.</p>`;

  const html = `<!doctype html>
<html lang="en"${light ? ' class="light"' : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CAS Stream Calendar</title>
<style>
:root{--bg:#09090b;--fg:#e4e4e7;--mut:#71717a;--line:#27272a;--head:#18181b;--chip:#27272a;--tw:#c9a7ff;--twbg:rgba(145,70,255,.2)}
:root.light{--bg:#ffffff;--fg:#18181b;--mut:#71717a;--line:#e4e4e7;--head:#f4f4f5;--chip:#f4f4f5;--tw:#6d28d9;--twbg:rgba(145,70,255,.12)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
table{width:100%;min-width:44rem;border-collapse:collapse}
th{background:var(--head);color:var(--mut);text-align:left;font-weight:600;padding:8px}
td{border-top:1px solid var(--line);padding:8px;vertical-align:top}
.wk{white-space:nowrap}
.sub{color:var(--mut);font-size:12px}
.w13{color:#f59e0b;font-size:12px}
.race{width:8.5rem;margin-bottom:8px}
.race:last-child{margin-bottom:0}
.when{font-size:12px}
.what{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.what a{color:inherit;text-decoration:none}.what a:hover{text-decoration:underline}
.planned .when,.planned .what{font-style:italic;color:var(--mut)}
.who{display:inline-block;border-radius:4px;padding:1px 8px;font-size:12px;background:var(--chip);color:var(--mut);text-decoration:none}
.who.on{background:var(--twbg);color:var(--tw);font-weight:600}
.foot{color:var(--mut);font-size:11px;margin:8px}
.foot a{color:inherit}
</style></head>
<body>
${body}
<p class="foot">Italic = date assumed, not in CLS yet. Times CET/CEST. <a href="${esc(SITE)}/streams/calendar" target="_blank" rel="noopener">CAS League Scoring</a></p>
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
