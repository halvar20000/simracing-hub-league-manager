import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/date";
import TableFilter from "@/components/TableFilter";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { refreshDiscordStatsAction } from "@/lib/actions/discord-stats";
import type { DiscordStatsData } from "@/lib/discord-stats";

// The Refresh action scans Discord message history — give the route room.
export const maxDuration = 60;

export default async function AdminDiscordStatsPage() {
  await requireAdmin();

  const snapshot = await prisma.discordStatsSnapshot.findFirst({
    orderBy: { generatedAt: "desc" },
  });

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

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table id="discordStatsTable" className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">CLS driver</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Msgs (30d)</th>
              <th className="px-3 py-2 text-center">Chat</th>
              <th className="px-3 py-2 text-center">League</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.members.map((m) => {
              const active = m.chatActive || m.leagueActive;
              return (
                <tr
                  key={m.discordId}
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
