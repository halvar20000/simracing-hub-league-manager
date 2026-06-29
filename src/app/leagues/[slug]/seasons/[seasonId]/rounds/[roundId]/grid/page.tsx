import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getRoundRsvpSummary } from "@/lib/rsvp";
import { formatDateTime } from "@/lib/date";
import {
  EligibleBadge,
  RSVP_STATUS_LABEL,
  type RoundEligibility,
} from "@/components/EligibleBadge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId, roundId } = await params;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: {
      name: true,
      roundNumber: true,
      seasonId: true,
      season: { select: { league: { select: { slug: true, name: true } } } },
    },
  });
  if (
    !round ||
    round.season.league.slug !== slug ||
    round.seasonId !== seasonId
  ) {
    return { title: "Round not found" };
  }
  return {
    title: `Grid & Waiting List — ${round.season.league.name} R${round.roundNumber}`,
    description: `Who is eligible to drive Round ${round.roundNumber} — ${round.name}.`,
  };
}

// Display order: confirmed grid → promoted fill-ins → waiting list → pending.
const ELIGIBILITY_RANK: Record<RoundEligibility, number> = {
  confirmed: 0,
  fillin: 1,
  waitlist: 2,
  pending: 3,
};

export default async function PublicRoundGridPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}) {
  const { slug, seasonId, roundId } = await params;

  const summary = await getRoundRsvpSummary(roundId);
  if (!summary) notFound();
  const { round, rows } = summary;
  if (round.season.league.slug !== slug || round.seasonId !== seasonId) {
    notFound();
  }

  const sorted = [...rows].sort((a, b) => {
    const r = ELIGIBILITY_RANK[a.eligibility] - ELIGIBILITY_RANK[b.eligibility];
    return r !== 0 ? r : a.displayName.localeCompare(b.displayName);
  });

  const eligibleCount = rows.filter((r) => r.eligible).length;
  const fillInCount = rows.filter((r) => r.eligibility === "fillin").length;
  const declinedCount = rows.filter((r) => r.status === "DECLINED").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← Back to round
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold">
            Grid &amp; Waiting List
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            R{round.roundNumber} — {round.name} · {round.track}
            {round.trackConfig ? ` (${round.trackConfig})` : ""} ·{" "}
            {formatDateTime(round.startsAt)}
          </p>
        </div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-100"
        >
          ← Season
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile color="emerald" label="Eligible to drive" value={eligibleCount} />
        <SummaryTile color="cyan" label="Filled in from waiting list" value={fillInCount} />
        <SummaryTile color="red" label="Declined" value={declinedCount} />
      </div>

      <p className="text-xs text-zinc-500">
        Confirmed grid drivers are always eligible. Each time a confirmed driver
        declines, the next driver on the waiting list becomes eligible for this
        round (shown as <span className="text-cyan-300">fill-in</span>). This is a
        read-only overview — RSVPs can only be changed from the round page or
        Discord.
      </p>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[480px] text-sm tabular-nums">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Driver</th>
              <th className="px-3 py-2 text-left">Eligible</th>
              <th className="px-3 py-2 text-left">RSVP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900/60"
              >
                <td className="px-3 py-2">{r.displayName}</td>
                <td className="px-3 py-2">
                  <EligibleBadge eligibility={r.eligibility} />
                </td>
                <td className="px-3 py-2">
                  {r.status ? (
                    RSVP_STATUS_LABEL[r.status]
                  ) : (
                    <span className="text-zinc-500">— silent —</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-zinc-500">
                  No drivers registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({
  color,
  label,
  value,
}: {
  color: "emerald" | "cyan" | "red";
  label: string;
  value: number;
}) {
  const ring: Record<typeof color, string> = {
    emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-100",
    cyan: "border-cyan-800 bg-cyan-950/40 text-cyan-100",
    red: "border-red-900 bg-red-950/40 text-red-100",
  };
  return (
    <div className={`rounded-lg border p-4 ${ring[color]}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
