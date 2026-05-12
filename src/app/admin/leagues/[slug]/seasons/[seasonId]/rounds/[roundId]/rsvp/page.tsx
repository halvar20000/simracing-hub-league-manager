import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getRoundRsvpSummary } from "@/lib/rsvp";
import { formatDateTime } from "@/lib/date";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { postRsvpManually, refreshRsvpMessageAction } from "@/lib/actions/rsvp";

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "✅ Accepted",
  DECLINED: "❌ Declined",
  TENTATIVE: "❔ Tentative",
};

export default async function AdminRoundRsvp({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;

  const summary = await getRoundRsvpSummary(roundId);
  if (!summary) notFound();
  const { round, rows, counts } = summary;
  if (round.season.league.slug !== slug || round.seasonId !== seasonId) {
    notFound();
  }

  const discordMessage = await prisma.roundDiscordRsvpMessage.findUnique({
    where: { roundId },
  });
  const league = round.season.league;

  // Group rows by status for display
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const declined = rows.filter((r) => r.status === "DECLINED");
  const tentative = rows.filter((r) => r.status === "TENTATIVE");
  const silent = rows.filter((r) => r.status === null);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">RSVP — R{round.roundNumber}: {round.name}</h1>
          <p className="text-sm text-zinc-400">
            {round.track}
            {round.trackConfig ? ` (${round.trackConfig})` : ""} •{" "}
            {formatDateTime(round.startsAt)}
          </p>
        </div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-100"
        >
          ← Season
        </Link>
      </div>

      {/* Tallies */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile color="emerald" label="Accepted" value={counts.accepted} />
        <Tile color="red" label="Declined" value={counts.declined} />
        <Tile color="amber" label="Tentative" value={counts.tentative} />
        <Tile color="zinc" label="Silent" value={counts.silent} />
      </div>

      {/* Discord status */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Discord RSVP message
        </h2>
        <div className="mt-2 space-y-1 text-sm">
          <p>
            Channel:{" "}
            <span className="font-mono text-zinc-300">
              {league.discordRsvpChannelId ?? "— not configured —"}
            </span>
          </p>
          <p>
            Posted at:{" "}
            <span className="text-zinc-300">
              {round.rsvpNotifiedAt
                ? formatDateTime(round.rsvpNotifiedAt)
                : "not yet"}
            </span>
          </p>
          <p>
            Message ID:{" "}
            <span className="font-mono text-zinc-300">
              {discordMessage?.messageId ?? "—"}
            </span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={postRsvpManually}>
            <input type="hidden" name="roundId" value={round.id} />
            <SubmitWithSpinner
              label={round.rsvpNotifiedAt ? "Repost now" : "Post now"}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            />
          </form>
          {discordMessage && (
            <form action={refreshRsvpMessageAction}>
              <input type="hidden" name="roundId" value={round.id} />
              <SubmitWithSpinner
                label="Refresh embed"
                className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
              />
            </form>
          )}
        </div>
        {!league.discordRsvpChannelId && (
          <p className="mt-3 text-xs text-amber-400">
            Configure <code>discordRsvpChannelId</code> on the league before posting.
          </p>
        )}
      </div>

      {/* Driver lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <DriverGroup title="Accepted" tone="emerald" drivers={accepted} />
        <DriverGroup title="Declined" tone="red" drivers={declined} />
        <DriverGroup title="Tentative" tone="amber" drivers={tentative} />
        <DriverGroup
          title="Silent — at risk"
          tone="zinc"
          drivers={silent}
          subtitle="No response — will incur a penalty point on no-show (GT3 WCT)."
        />
      </div>

      {/* Full table */}
      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Driver</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Responded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.registrationId} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                <td className="px-3 py-2">{r.displayName}</td>
                <td className="px-3 py-2">
                  {r.status ? STATUS_LABEL[r.status] : <span className="text-zinc-500">— silent —</span>}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {r.source ? r.source.toLowerCase() : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {r.respondedAt ? formatDateTime(r.respondedAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  color,
  label,
  value,
}: {
  color: "emerald" | "red" | "amber" | "zinc";
  label: string;
  value: number;
}) {
  const ring: Record<typeof color, string> = {
    emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-100",
    red: "border-red-900 bg-red-950/40 text-red-100",
    amber: "border-amber-800 bg-amber-950/40 text-amber-100",
    zinc: "border-zinc-700 bg-zinc-900 text-zinc-100",
  };
  return (
    <div className={`rounded-lg border p-4 ${ring[color]}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function DriverGroup({
  title,
  tone,
  drivers,
  subtitle,
}: {
  title: string;
  tone: "emerald" | "red" | "amber" | "zinc";
  drivers: { registrationId: string; displayName: string }[];
  subtitle?: string;
}) {
  const ring: Record<typeof tone, string> = {
    emerald: "border-emerald-900",
    red: "border-red-900",
    amber: "border-amber-900",
    zinc: "border-zinc-700",
  };
  return (
    <div className={`rounded-lg border ${ring[tone]} bg-zinc-900/40 p-4`}>
      <h3 className="text-sm font-semibold text-zinc-200">
        {title} <span className="text-zinc-500">({drivers.length})</span>
      </h3>
      {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
      <ul className="mt-2 space-y-1 text-sm text-zinc-300">
        {drivers.length === 0 ? (
          <li className="text-zinc-500">—</li>
        ) : (
          drivers.map((d) => <li key={d.registrationId}>{d.displayName}</li>)
        )}
      </ul>
    </div>
  );
}
