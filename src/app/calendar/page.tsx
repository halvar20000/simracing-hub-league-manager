import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Race Calendar",
  description:
    "Upcoming races across every CAS league — at-a-glance overview by month and week. Pick a round to RSVP or see details.",
  url: "/calendar",
});

// Date arithmetic is calendar-day based, but the underlying timestamps are
// UTC. Render dates in the viewer's locale (server-rendered) but anchor day
// math to local midnight to avoid drifting around DST.
export const dynamic = "force-dynamic";

type ViewMode = "month" | "week";

type RoundRow = {
  id: string;
  roundNumber: number;
  name: string;
  track: string;
  trackConfig: string | null;
  startsAt: Date;
  status: string;
  seasonId: string;
  seasonName: string;
  seasonYear: number;
  leagueName: string;
  leagueSlug: string;
  leagueColor: string;
  leagueLogoUrl: string | null;
};

const DEFAULT_LEAGUE_COLOR = "#ff6b35";

// ---------- date helpers ----------
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeekMonday(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // 0..6 with Monday=0
  return startOfDay(addDays(d, -day));
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseAnchorParam(s: string | undefined): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, dd] = s.split("-").map(Number);
    const d = new Date(y, (m ?? 1) - 1, dd ?? 1);
    if (!isNaN(d.getTime())) return d;
  }
  return startOfDay(new Date());
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

// ---------- page ----------
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string }>;
}) {
  const { view: viewRaw, from } = await searchParams;
  const view: ViewMode = viewRaw === "week" ? "week" : "month";
  const anchor = parseAnchorParam(from);
  const today = startOfDay(new Date());

  // Date window: cover what's on screen plus a 14-day past window for the
  // "recently completed" use case. Always include yesterday/today even if the
  // anchor is in the future, since "today" is a useful reference point.
  const periods = view === "month" ? 3 : 4;
  const windowStart = addDays(
    view === "month" ? startOfMonth(anchor) : startOfWeekMonday(anchor),
    -14
  );
  const windowEnd =
    view === "month"
      ? addMonths(startOfMonth(anchor), periods)
      : addDays(startOfWeekMonday(anchor), periods * 7);

  const rounds = await prisma.round.findMany({
    where: {
      startsAt: { gte: windowStart, lt: windowEnd },
      // DRAFT included intentionally — the calendar treats a published-but-
      // not-yet-flipped season the same as an active one, so new seasons
      // appear as soon as their rounds are scheduled. PAUSED stays excluded
      // (that status is the explicit "hide everywhere" signal).
      season: { status: { in: ["DRAFT", "OPEN_REGISTRATION", "ACTIVE"] } },
    },
    include: {
      season: {
        include: {
          league: {
            select: {
              name: true,
              slug: true,
              discordEmbedColor: true,
              logoUrl: true,
            },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const rows: RoundRow[] = rounds.map((r) => ({
    id: r.id,
    roundNumber: r.roundNumber,
    name: r.name,
    track: r.track,
    trackConfig: r.trackConfig,
    startsAt: r.startsAt,
    status: r.status,
    seasonId: r.seasonId,
    seasonName: r.season.name,
    seasonYear: r.season.year,
    leagueName: r.season.league.name,
    leagueSlug: r.season.league.slug,
    leagueColor: r.season.league.discordEmbedColor ?? DEFAULT_LEAGUE_COLOR,
    leagueLogoUrl: r.season.league.logoUrl,
  }));

  // Bucket by YYYY-MM-DD for fast lookup in the month grid.
  const byDay = new Map<string, RoundRow[]>();
  for (const r of rows) {
    const key = ymd(r.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }

  // Nav targets
  const prevAnchor =
    view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7);
  const nextAnchor =
    view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leagues"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Leagues
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">
          Race Calendar
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every planned race across CAS leagues. Tap a chip to open the round
          page.
        </p>

        {/* Subscribe / download CTAs.
            • Subscribe uses webcal:// so Apple Calendar, Outlook desktop, and
              Google Calendar (when imported as URL) all auto-refresh on a
              schedule — no manual re-import when rounds get added.
            • Download grabs a one-shot .ics for users who prefer a static
              import. */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a
            href="webcal://league.simracing-hub.com/api/calendar"
            className="rounded border border-cyan-600 px-3 py-1.5 font-medium text-cyan-300 hover:bg-cyan-900/30"
            title="Subscribe in Apple Calendar / Outlook / Google Calendar — auto-refreshes"
          >
            Subscribe (Outlook / Google / Apple) →
          </a>
          <a
            href="/api/calendar"
            download="cas-calendar.ics"
            className="rounded border border-zinc-700 px-3 py-1.5 font-medium text-zinc-300 hover:bg-zinc-800"
            title="One-shot .ics download — won't refresh automatically"
          >
            Download .ics
          </a>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded border border-zinc-800 bg-zinc-900 p-1 text-xs">
          <Link
            href={`/calendar?view=month&from=${ymd(anchor)}`}
            className={`rounded px-3 py-1.5 ${
              view === "month"
                ? "bg-[#ff6b35] text-zinc-950"
                : "text-zinc-300 hover:text-zinc-100"
            }`}
          >
            Month
          </Link>
          <Link
            href={`/calendar?view=week&from=${ymd(anchor)}`}
            className={`rounded px-3 py-1.5 ${
              view === "week"
                ? "bg-[#ff6b35] text-zinc-950"
                : "text-zinc-300 hover:text-zinc-100"
            }`}
          >
            Week
          </Link>
        </div>

        <div className="inline-flex items-center gap-1 text-xs">
          <Link
            href={`/calendar?view=${view}&from=${ymd(prevAnchor)}`}
            className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800"
          >
            ← Prev
          </Link>
          <Link
            href={`/calendar?view=${view}&from=${ymd(today)}`}
            className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800"
          >
            Today
          </Link>
          <Link
            href={`/calendar?view=${view}&from=${ymd(nextAnchor)}`}
            className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-800"
          >
            Next →
          </Link>
        </div>
      </div>

      {view === "month" ? (
        <MonthsView anchor={anchor} months={periods} byDay={byDay} today={today} />
      ) : (
        <WeeksView anchor={anchor} weeks={periods} rows={rows} today={today} />
      )}

      {/* Recently completed (last 14 days) */}
      <RecentlyCompleted rows={rows} today={today} />
    </div>
  );
}

// ---------- month view ----------
function MonthsView({
  anchor,
  months,
  byDay,
  today,
}: {
  anchor: Date;
  months: number;
  byDay: Map<string, RoundRow[]>;
  today: Date;
}) {
  const start = startOfMonth(anchor);
  const grids = Array.from({ length: months }, (_, i) => addMonths(start, i));
  return (
    <div className="space-y-6">
      {grids.map((m) => (
        <MonthGrid key={m.toISOString()} month={m} byDay={byDay} today={today} />
      ))}
    </div>
  );
}

function MonthGrid({
  month,
  byDay,
  today,
}: {
  month: Date;
  byDay: Map<string, RoundRow[]>;
  today: Date;
}) {
  const first = startOfMonth(month);
  const gridStart = startOfWeekMonday(first);
  // 6 rows × 7 cols = always 42 cells; covers every month.
  const days: Date[] = Array.from({ length: 42 }, (_, i) =>
    addDays(gridStart, i)
  );
  const monthIdx = month.getMonth();

  return (
    <section className="rounded border border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <h2 className="font-display text-base font-semibold tracking-wide">
          {fmtMonthYear(month)}
        </h2>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === monthIdx;
          const key = ymd(d);
          const list = byDay.get(key) ?? [];
          const isToday = ymd(d) === ymd(today);
          return (
            <div
              key={key}
              className={`min-h-[5rem] border-r border-b border-zinc-800/70 p-1.5 last:border-r-0 ${
                inMonth ? "bg-zinc-950" : "bg-zinc-950/40"
              } ${isToday ? "ring-1 ring-inset ring-[#ff6b35]" : ""}`}
            >
              <div
                className={`mb-1 flex items-center justify-between text-[10px] ${
                  inMonth ? "text-zinc-400" : "text-zinc-700"
                }`}
              >
                <span
                  className={`tabular-nums ${
                    isToday ? "font-bold text-[#ff6b35]" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {list.slice(0, 3).map((r) => (
                  <DayChip key={r.id} r={r} />
                ))}
                {list.length > 3 && (
                  <div className="text-[10px] text-zinc-500">
                    +{list.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayChip({ r }: { r: RoundRow }) {
  // Two-line chip:
  //   row 1: league logo (or short name fallback) + start time
  //   row 2: track name, truncated
  // The whole chip uses the league's discordEmbedColor as a soft background
  // tint instead of saturating the cell — keeps the day readable when many
  // races sit on the same day.
  const tint = `${r.leagueColor}33`; // ~20% alpha hex shortcut
  return (
    <Link
      href={`/leagues/${r.leagueSlug}/seasons/${r.seasonId}/rounds/${r.id}`}
      className="block overflow-hidden rounded border border-transparent px-1.5 py-1 text-[10px] font-medium text-zinc-100 transition-colors hover:border-zinc-700"
      style={{ backgroundColor: tint, borderLeftColor: r.leagueColor, borderLeftWidth: 2 }}
      title={`${r.leagueName} · R${r.roundNumber} ${r.name} — ${r.track}${
        r.trackConfig ? ` (${r.trackConfig})` : ""
      } · ${fmtTime(r.startsAt)}`}
    >
      <span className="flex items-center justify-between gap-1">
        {r.leagueLogoUrl ? (
          <img
            src={r.leagueLogoUrl}
            alt={r.leagueName}
            className="h-3.5 w-auto max-w-[60%] object-contain"
          />
        ) : (
          <span className="truncate text-[10px] font-semibold text-zinc-200">
            {shortLeague(r.leagueName)}
          </span>
        )}
        <span className="tabular-nums text-[10px] text-zinc-300">
          {fmtTime(r.startsAt)}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-zinc-400">
        {r.track}
      </span>
    </Link>
  );
}

function shortLeague(name: string): string {
  // "CAS GT3 WCT" → "GT3 WCT" ; "CAS SFL Cup" → "SFL Cup"
  return name.replace(/^CAS\s+/i, "");
}

// ---------- week view ----------
function WeeksView({
  anchor,
  weeks,
  rows,
  today,
}: {
  anchor: Date;
  weeks: number;
  rows: RoundRow[];
  today: Date;
}) {
  const start = startOfWeekMonday(anchor);
  const weekStarts = Array.from({ length: weeks }, (_, i) =>
    addDays(start, i * 7)
  );

  return (
    <div className="space-y-4">
      {weekStarts.map((ws) => {
        const we = addDays(ws, 7);
        const inWeek = rows.filter(
          (r) =>
            r.startsAt.getTime() >= ws.getTime() &&
            r.startsAt.getTime() < we.getTime()
        );
        return (
          <section
            key={ws.toISOString()}
            className="rounded border border-zinc-800"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
              <h2 className="font-display text-sm font-semibold tracking-wide">
                Week of {ws.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                {" — "}
                {addDays(we, -1).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </h2>
              <span className="text-xs text-zinc-500">
                {inWeek.length} race{inWeek.length === 1 ? "" : "s"}
              </span>
            </div>
            {inWeek.length === 0 ? (
              <p className="px-4 py-4 text-xs text-zinc-500">
                No races scheduled this week.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {inWeek.map((r) => {
                  const isToday = ymd(r.startsAt) === ymd(today);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/leagues/${r.leagueSlug}/seasons/${r.seasonId}/rounds/${r.id}`}
                        className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-900/60"
                      >
                        <span
                          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: r.leagueColor }}
                          aria-hidden
                        />
                        <span className="w-12 text-xs uppercase tracking-wider text-zinc-500">
                          {fmtWeekday(r.startsAt)}
                        </span>
                        <span
                          className={`w-14 text-xs tabular-nums ${
                            isToday ? "font-bold text-[#ff6b35]" : "text-zinc-400"
                          }`}
                        >
                          {r.startsAt.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <span className="w-14 text-xs tabular-nums text-zinc-300">
                          {fmtTime(r.startsAt)}
                        </span>
                        {r.leagueLogoUrl ? (
                          <img
                            src={r.leagueLogoUrl}
                            alt={r.leagueName}
                            title={r.leagueName}
                            className="h-5 w-auto max-w-[5rem] object-contain"
                          />
                        ) : (
                          <span className="text-xs font-medium text-zinc-200">
                            {shortLeague(r.leagueName)}
                          </span>
                        )}
                        <span className="text-xs text-zinc-500">·</span>
                        <span className="text-xs text-zinc-300">
                          R{r.roundNumber} {r.name}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {r.track}
                          {r.trackConfig ? ` (${r.trackConfig})` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------- recently completed ----------
function RecentlyCompleted({
  rows,
  today,
}: {
  rows: RoundRow[];
  today: Date;
}) {
  const cutoff = addDays(today, -14);
  const recent = rows
    .filter(
      (r) =>
        r.startsAt.getTime() >= cutoff.getTime() &&
        r.startsAt.getTime() < today.getTime()
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  if (recent.length === 0) return null;

  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="mb-3 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Recently raced (last 14 days)
      </h2>
      <ul className="space-y-1">
        {recent.map((r) => (
          <li key={r.id}>
            <Link
              href={`/leagues/${r.leagueSlug}/seasons/${r.seasonId}/rounds/${r.id}`}
              className="flex flex-wrap items-center gap-2 rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            >
              <span
                className="inline-flex h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: r.leagueColor }}
                aria-hidden
              />
              <span className="text-xs tabular-nums text-zinc-500">
                {r.startsAt.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
              {r.leagueLogoUrl ? (
                <img
                  src={r.leagueLogoUrl}
                  alt={r.leagueName}
                  title={r.leagueName}
                  className="h-4 w-auto max-w-[4rem] object-contain"
                />
              ) : (
                <span className="text-xs">{shortLeague(r.leagueName)}</span>
              )}
              <span className="text-xs">
                R{r.roundNumber} {r.name} — {r.track}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
