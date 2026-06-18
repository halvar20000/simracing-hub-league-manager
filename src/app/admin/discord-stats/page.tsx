import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/date";
import TableFilter from "@/components/TableFilter";
import { SortableTableEnhancer } from "@/components/SortableTableEnhancer";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { refreshDiscordStatsAction } from "@/lib/actions/discord-stats";
import type { DiscordStatsData, MonthlyRow } from "@/lib/discord-stats";

// The Refresh action scans Discord message history — give the route room.
export const maxDuration = 60;

export default async function AdminDiscordStatsPage() {
  await requireAdmin();

  const [snapshot, monthlyDesc] = await Promise.all([
    prisma.discordStatsSnapshot.findFirst({
      orderBy: { generatedAt: "desc" },
    }),
    prisma.discordMonthlyActivity.findMany({
      orderBy: { month: "desc" },
      take: 24,
    }),
  ]);
  // Oldest → newest for the trend chart.
  const monthly: MonthlyRow[] = [...monthlyDesc].reverse().map((r) => ({
    month: r.month,
    messageCount: r.messageCount,
    activeMembers: r.activeMembers,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Discord community stats</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Who in the CAS Discord server is active — chatting, racing, or newly
            joined — over the last 30 days.
          </p>
        </div>
        <form action={refreshDiscordStatsAction}>
          <SubmitWithSpinner
            label="Refresh now"
            pendingLabel="Refreshing…"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          />
        </form>
      </div>

      <TrendChart months={monthly} />

      {!snapshot ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          No snapshot yet. Click <strong className="text-zinc-200">Refresh
          now</strong> to build the first one — it scans the Discord server and
          can take up to a minute. After that it refreshes automatically once a
          day.
        </div>
      ) : (
        <StatsView
          stats={snapshot.data as unknown as DiscordStatsData}
          generatedAt={snapshot.generatedAt}
        />
      )}
    </div>
  );
}

function StatsView({
  stats,
  generatedAt,
}: {
  stats: DiscordStatsData;
  generatedAt: Date;
}) {
  const t = stats.totals;

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500">
        Snapshot from {formatDateTime(generatedAt)} • {stats.windowDays}-day
        window • scanned {stats.scan.channelsScanned} channels
        {stats.scan.channelsSkipped > 0 &&
          ` (${stats.scan.channelsSkipped} not readable by the bot)`}
        , {stats.scan.messagesScanned.toLocaleString()} messages
        {stats.scan.partial &&
          " — partial scan: the time budget was reached before every channel was read"}
        .
      </p>

      {stats.errors.length > 0 && (
        <div className="space-y-1 rounded border border-amber-800 bg-amber-950/60 p-3 text-xs text-amber-200">
          {stats.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Server members" value={t.members} />
        <Tile label="Linked to CLS" value={t.linked} />
        <Tile label="Registered drivers" value={t.registeredDrivers} />
        <Tile label="New (30d)" value={t.joinedInWindow} tone="cyan" />
        <Tile label="Chat-active (30d)" value={t.chatActive} tone="emerald" />
        <Tile label="League-active (30d)" value={t.leagueActive} tone="emerald" />
        <Tile label="Active — either" value={t.activeEither} tone="emerald" />
        <Tile label="Lurkers" value={t.lurkers} tone="zinc" />
      </div>

      <TableFilter
        tableId="discordStatsTable"
        placeholder="Filter members by name, CLS driver, status…"
      />
      <SortableTableEnhancer tableId="discordStatsTable" />

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table id="discordStatsTable" className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th data-col="member" className="px-3 py-2">Member</th>
              <th data-col="cls" className="px-3 py-2">CLS driver</th>
              <th data-col="joined" className="px-3 py-2">Joined</th>
              <th data-col="msgs" className="px-3 py-2 text-right">Msgs (30d)</th>
              <th data-col="chat" className="px-3 py-2 text-center">Chat</th>
              <th data-col="league" className="px-3 py-2 text-center">League</th>
              <th data-col="status" className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.members.map((m) => {
              const active = m.chatActive || m.leagueActive;
              const joinedKey = m.joinedAt
                ? String(new Date(m.joinedAt).getTime())
                : "";
              return (
                <tr
                  key={m.discordId}
                  data-r-member={m.name ?? ""}
                  data-r-cls={m.clsName ?? ""}
                  data-r-joined={joinedKey}
                  data-r-msgs={String(m.messages ?? 0)}
                  data-r-chat={m.chatActive ? "1" : "0"}
                  data-r-league={m.leagueActive ? "1" : "0"}
                  data-r-status={active ? "active" : "lurker"}
                  data-filter={[
                    m.name,
                    m.clsName,
                    m.chatActive ? "chat" : "",
                    m.leagueActive ? "league" : "",
                    active ? "active" : "lurker",
                    m.joinedInWindow ? "new" : "",
                    m.linked ? "linked" : "unlinked",
                  ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()}
                  className="border-t border-zinc-800 hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-2 font-medium">
                    {m.name}
                    {m.joinedInWindow && (
                      <span className="ml-1.5 rounded bg-cyan-900/60 px-1 text-[10px] font-semibold text-cyan-200">
                        NEW
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {m.clsName ?? (
                      <span className="text-zinc-600">— not linked —</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">
                    {m.joinedAt ? formatDate(m.joinedAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.messages > 0 ? m.messages : <span className="text-zinc-600">0</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Dot on={m.chatActive} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Dot on={m.leagueActive} />
                  </td>
                  <td className="px-3 py-2">
                    {active ? (
                      <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-400">
                        Lurker
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "cyan" | "zinc";
}) {
  const ring: Record<string, string> = {
    default: "border-zinc-800 bg-zinc-900 text-zinc-100",
    emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-100",
    cyan: "border-cyan-800 bg-cyan-950/40 text-cyan-100",
    zinc: "border-zinc-700 bg-zinc-900 text-zinc-300",
  };
  return (
    <div className={`rounded-lg border p-4 ${ring[tone]}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        on ? "bg-emerald-400" : "bg-zinc-700"
      }`}
      aria-label={on ? "yes" : "no"}
    />
  );
}

/**
 * Monthly chat-activity trend: message-volume bars + an active-members line.
 * Server-rendered static SVG — the data is a plain monthly array.
 */
function TrendChart({ months }: { months: MonthlyRow[] }) {
  if (months.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Chat activity trend
        </h2>
        <p className="mt-2">
          No trend history yet. Run the one-time backfill —{" "}
          <code className="rounded bg-zinc-800 px-1 text-xs">
            outputs/run_backfill_discord_activity.sh
          </code>{" "}
          — to load up to 24 months of monthly chat activity.
        </p>
      </div>
    );
  }

  const W = 760;
  const H = 260;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = months.length;
  const colW = chartW / n;
  const baseY = padT + chartH;
  const maxMsg = Math.max(1, ...months.map((m) => m.messageCount));
  const maxActive = Math.max(1, ...months.map((m) => m.activeMembers));
  const barW = Math.min(30, colW * 0.6);
  const labelEvery = n > 14 ? 3 : n > 7 ? 2 : 1;

  const linePts = months.map((m, i) => ({
    m,
    cx: padL + colW * i + colW / 2,
    cy: padT + chartH - (m.activeMembers / maxActive) * chartH,
  }));

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Chat activity trend — last {n} month{n === 1 ? "" : "s"}
        </h2>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: "#ff6b35" }}
            />
            Messages
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#34d399" }}
            />
            Active members
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <line
          x1={padL}
          y1={baseY}
          x2={W - padR}
          y2={baseY}
          stroke="#3f3f46"
          strokeWidth="1"
        />
        {months.map((m, i) => {
          const h = (m.messageCount / maxMsg) * chartH;
          const cx = padL + colW * i + colW / 2;
          const inProgress = i === n - 1;
          return (
            <rect
              key={m.month}
              x={cx - barW / 2}
              y={baseY - h}
              width={barW}
              height={h}
              fill="#ff6b35"
              opacity={inProgress ? 0.4 : 0.85}
            >
              <title>
                {`${m.month}: ${m.messageCount.toLocaleString()} messages, ${m.activeMembers} active members${
                  inProgress ? " (month in progress)" : ""
                }`}
              </title>
            </rect>
          );
        })}
        <polyline
          points={linePts.map((p) => `${p.cx},${p.cy}`).join(" ")}
          fill="none"
          stroke="#34d399"
          strokeWidth="2"
        />
        {linePts.map((p) => (
          <circle key={p.m.month} cx={p.cx} cy={p.cy} r="3" fill="#34d399">
            <title>{`${p.m.month}: ${p.m.activeMembers} active members`}</title>
          </circle>
        ))}
        {months.map((m, i) =>
          i % labelEvery === 0 ? (
            <text
              key={m.month}
              x={padL + colW * i + colW / 2}
              y={H - 9}
              textAnchor="middle"
              fontSize="10"
              fill="#71717a"
            >
              {m.month.slice(2)}
            </text>
          ) : null
        )}
        <text x={padL} y={padT - 6} fontSize="10" fill="#a1a1aa">
          peak {maxMsg.toLocaleString()} msgs
        </text>
        <text
          x={W - padR}
          y={padT - 6}
          fontSize="10"
          fill="#a1a1aa"
          textAnchor="end"
        >
          peak {maxActive} active
        </text>
      </svg>

      <p className="mt-1 text-xs text-zinc-500">
        Bars: messages posted per month. Line: distinct members who posted that
        month. The faded last bar is the month still in progress. Hover any bar
        for exact numbers.
      </p>
    </div>
  );
}
