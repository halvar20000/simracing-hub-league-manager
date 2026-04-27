import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createIncidentReport } from "@/lib/actions/incident-reports";

export default async function FileReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { error } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/report`
    );
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();

  const reporterReg = await prisma.registration.findFirst({
    where: {
      seasonId,
      userId: session.user.id,
      status: "APPROVED",
    },
    include: { user: true },
  });
  if (!reporterReg) {
    return (
      <div className="space-y-3">
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="font-display text-2xl font-bold">
          Report an incident
        </h1>
        <p className="text-sm text-zinc-400">
          Only approved drivers in this season can file incident reports.
        </p>
      </div>
    );
  }

  const action = createIncidentReport.bind(null, slug, seasonId, roundId);

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold">
          Report an incident
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Round {round.roundNumber} — {round.name}
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-400">
        Filing as:{" "}
        <span className="font-semibold text-zinc-200">
          {reporterReg.user.firstName} {reporterReg.user.lastName}
        </span>
        {reporterReg.startNumber != null && (
          <span> #{reporterReg.startNumber}</span>
        )}
      </div>

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Lap number (optional)
            </span>
            <input
              name="lapNumber"
              type="number"
              min={1}
              max={999}
              placeholder="e.g. 12"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Turn or sector (optional)
            </span>
            <input
              name="turnOrSector"
              type="text"
              placeholder="e.g. T3 / sector 2"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Other driver(s) by start number
          </span>
          <input
            name="involvedStartNumbers"
            type="text"
            placeholder="e.g. 26, 89"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Comma-separated. The system matches each number to a driver in the
            roster. You are automatically included as the reporter.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Description <span className="text-orange-400">*</span>
          </span>
          <textarea
            name="description"
            required
            rows={5}
            placeholder="What happened? Be factual and specific."
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Evidence links (optional)
          </span>
          <textarea
            name="evidenceLinks"
            rows={3}
            placeholder={"One per line — YouTube URL with timestamp, screenshot link, etc."}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Submit report
          </button>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
