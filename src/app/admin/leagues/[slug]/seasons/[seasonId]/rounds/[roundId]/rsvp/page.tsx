import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getRoundRsvpSummary } from "@/lib/rsvp";
import { formatDateTime } from "@/lib/date";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import AdminRsvpControl from "@/components/AdminRsvpControl";
import {
  postRsvpManually,
  refreshRsvpMessageAction,
  checkDiscordAccessAction,
} from "@/lib/actions/rsvp";

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "✅ Accepted",
  DECLINED: "❌ Declined",
  TENTATIVE: "❔ Tentative",
};

const REASON_HINTS: Record<string, string> = {
  "round-not-found": "Round does not exist (was it deleted?).",
  "already-notified": "Round was already notified (we use force=true here so this shouldn't appear).",
  "no-channel": "No Discord channel ID is configured on the league. Set it in Edit League.",
  "round-not-upcoming": "Round status is not UPCOMING — only upcoming rounds can be posted.",
  "too-early": "Round is further out than the league's rsvpDaysBefore window.",
  "post-failed": "Discord rejected the post — see the details below.",
};

export default async function AdminRoundRsvp({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const sp = await searchParams;
  const pickStr = (k: string): string | null => {
    const v = sp[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0] ?? null;
    return null;
  };

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
  // The "Eligible" column is only meaningful when a waiting list is active
  // (the season has a driver cap). Otherwise every driver is eligible.
  const waitlistActive = round.season.maxDrivers != null;

  // Group rows by status for display
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const declined = rows.filter((r) => r.status === "DECLINED");
  const tentative = rows.filter((r) => r.status === "TENTATIVE");
  const silent = rows.filter((r) => r.status === null);

  // Waiting-list fill-ins offered for this round (a confirmed driver declined,
  // so the next on the waiting list was auto-invited + DM'd).
  const fillIns = await prisma.roundFillIn.findMany({
    where: { roundId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      notifiedAt: true,
      acceptedAt: true,
      registration: {
        select: {
          startNumber: true,
          user: {
            select: { name: true, firstName: true, lastName: true, iracingMemberId: true },
          },
        },
      },
    },
  });

  // Read banners from search params (set by the server action redirects).
  const postStatus = pickStr("status");
  const postReason = pickStr("reason");
  const postMessageId = pickStr("messageId");
  const postDiscordStatus = pickStr("discordStatus");
  const postDiscordBody = pickStr("discordBody");

  const diagStatus = pickStr("diagStatus");
  const diagReason = pickStr("diagReason");
  const diagChannelName = pickStr("diagChannelName");
  const diagGuildId = pickStr("diagGuildId");
  const diagDiscordStatus = pickStr("diagDiscordStatus");

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

      {/* Post-now result banner */}
      {postStatus === "posted" && (
        <div className="rounded border border-emerald-700 bg-emerald-950/60 p-3 text-sm">
          <strong className="text-emerald-300">Posted ✓</strong>{" "}
          <span className="text-emerald-200">
            Message ID:{" "}
            <code className="rounded bg-emerald-950 px-1 font-mono">{postMessageId}</code>
          </span>
        </div>
      )}
      {postStatus === "error" && (
        <div className="rounded border border-red-700 bg-red-950/60 p-3 text-sm text-red-100 space-y-1">
          <div>
            <strong className="text-red-200">Post failed:</strong>{" "}
            <code className="rounded bg-red-950 px-1 font-mono">{postReason}</code>
          </div>
          {postReason && REASON_HINTS[postReason] && (
            <div className="text-xs text-red-200/80">{REASON_HINTS[postReason]}</div>
          )}
          {postReason === "post-failed" && (
            <div className="mt-1 text-xs">
              Discord HTTP{" "}
              <code className="rounded bg-red-950 px-1 font-mono">{postDiscordStatus}</code>{" "}
              — body:
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-red-950 p-2 text-[11px]">
                {postDiscordBody}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Discord diagnostic banner */}
      {diagStatus === "ok" && (
        <div className="rounded border border-cyan-700 bg-cyan-950/60 p-3 text-sm text-cyan-100">
          <strong className="text-cyan-200">Discord access ✓</strong> — bot can see channel{" "}
          <code className="rounded bg-cyan-950 px-1 font-mono">#{diagChannelName}</code>{" "}
          in guild{" "}
          <code className="rounded bg-cyan-950 px-1 font-mono">{diagGuildId}</code>.
        </div>
      )}
      {diagStatus === "error" && (
        <div className="rounded border border-amber-700 bg-amber-950/60 p-3 text-sm text-amber-100 space-y-1">
          <div>
            <strong className="text-amber-200">Discord access check failed</strong>
            {diagDiscordStatus && (
              <>
                {" "}— HTTP{" "}
                <code className="rounded bg-amber-950 px-1 font-mono">{diagDiscordStatus}</code>
              </>
            )}
          </div>
          {diagReason && (
            <pre className="max-h-40 overflow-auto rounded bg-amber-950 p-2 text-[11px]">
              {diagReason}
            </pre>
          )}
          <div className="text-xs text-amber-200/80">
            Common causes: invalid <code>DISCORD_BOT_TOKEN</code> (HTTP 401), bot not in
            the server (HTTP 404), bot lacks View Channel permission (HTTP 403), or
            channel ID is wrong.
          </div>
        </div>
      )}

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
          <form action={checkDiscordAccessAction}>
            <input type="hidden" name="roundId" value={round.id} />
            <SubmitWithSpinner
              label="Check Discord access"
              className="rounded border border-cyan-700 bg-cyan-950/40 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-900/60"
            />
          </form>
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

      {/* Waiting-list fill-ins for this round */}
      {fillIns.length > 0 && (
        <div className="space-y-2 rounded border border-cyan-900/50 bg-cyan-950/20 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Waiting-list fill-ins ({fillIns.length})
          </h2>
          <p className="text-xs text-zinc-400">
            A confirmed driver declined, so these waiting-list drivers were
            auto-invited for this round by Discord DM (with Accept / Decline
            buttons) and email. Once a driver shows{" "}
            <span className="text-emerald-200">✓ Accepted</span>, send them the
            iRacing race invite to lock in their entry. You&apos;re also emailed
            on every offer and acceptance.
          </p>
          <ul className="space-y-1 text-sm">
            {fillIns.map((f) => {
              const u = f.registration.user;
              const name =
                `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
                u.name ||
                "—";
              return (
                <li key={f.id} className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{name}</span>
                  {u.iracingMemberId && (
                    <span className="text-xs text-zinc-500 tabular-nums">
                      iR {u.iracingMemberId}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                      f.notifiedAt
                        ? "bg-emerald-900/40 text-emerald-200"
                        : "bg-amber-900/40 text-amber-200"
                    }`}
                  >
                    {f.notifiedAt ? "Notified" : "Notify pending"}
                  </span>
                  {f.acceptedAt ? (
                    <span className="rounded bg-emerald-600/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                      ✓ Accepted
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                      Awaiting reply
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Full table with per-driver admin override */}
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            All drivers
          </h2>
          <p className="text-xs text-zinc-500">
            Use the override buttons to set or clear a driver&apos;s RSVP — handy
            when a driver can&apos;t use the Discord button themselves. Changes
            are stamped <span className="text-zinc-300">admin</span> and the
            Discord embed refreshes automatically.
          </p>
          {waitlistActive && (
            <p className="text-xs text-zinc-500">
              <span className="text-zinc-300">Eligible</span> shows who may drive
              this round: confirmed grid drivers are always eligible, and each
              time a confirmed driver declines, the next waiting-list driver
              becomes eligible for this round (shown as{" "}
              <span className="text-cyan-300">fill-in</span>).
            </p>
          )}
        </div>
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full min-w-[760px] text-sm tabular-nums">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left driver-col">Driver</th>
                {waitlistActive && (
                  <th className="px-3 py-2 text-left">Eligible</th>
                )}
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Responded</th>
                <th className="px-3 py-2 text-left">Admin override</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.registrationId} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                  <td className="px-3 py-2 driver-col">{r.displayName}</td>
                  {waitlistActive && (
                    <td className="px-3 py-2">
                      <EligibleBadge eligibility={r.eligibility} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {r.status ? STATUS_LABEL[r.status] : <span className="text-zinc-500">— silent —</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.source ? r.source.toLowerCase() : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {r.respondedAt ? formatDateTime(r.respondedAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <AdminRsvpControl
                      roundId={round.id}
                      registrationId={r.registrationId}
                      currentStatus={r.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EligibleBadge({
  eligibility,
}: {
  eligibility: "confirmed" | "fillin" | "waitlist" | "pending";
}) {
  if (eligibility === "confirmed") {
    return (
      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-200">
        ✓ Yes
      </span>
    );
  }
  if (eligibility === "fillin") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-200">
          ✓ Yes
        </span>
        <span className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
          fill-in
        </span>
      </span>
    );
  }
  if (eligibility === "waitlist") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[11px] text-zinc-500">No</span>
        <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200/80">
          waiting list
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-zinc-500">No</span>
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
        pending
      </span>
    </span>
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
