import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { protestWindowState, formatCountdown } from "@/lib/protest-window";

export default async function NewReportPicker() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/reports/new");

  // All seasons the user is approved in
  const myRegs = await prisma.registration.findMany({
    where: { userId: session.user.id, status: "APPROVED" },
    include: {
      season: {
        include: {
          league: true,
          scoringSystem: { select: { protestWindowHours: true } },
          rounds: {
            orderBy: { roundNumber: "asc" },
            select: {
              id: true,
              roundNumber: true,
              name: true,
              track: true,
              startsAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← My reports
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold">
            New incident report
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pick the round you want to report against.
          </p>
        </div>
      </div>

      {myRegs.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          You are not registered in any active season, so you cannot file a
          report yet.
        </p>
      ) : (
        <div className="space-y-6">
          {myRegs.map((reg) => (
            <section
              key={reg.id}
              className="rounded border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <header className="mb-3">
                <h2 className="font-display text-lg font-bold">
                  {reg.season.league.name}
                </h2>
                <p className="text-sm text-zinc-400">{reg.season.name}</p>
              </header>
              {reg.season.rounds.length === 0 ? (
                <p className="text-sm text-zinc-500">No rounds yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {reg.season.rounds.map((r) => {
                    const w = protestWindowState({
                      raceStartsAt: r.startsAt,
                      protestWindowHours:
                        reg.season.scoringSystem.protestWindowHours,
                    });
                    const closed = w.status === "CLOSED";
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/leagues/${reg.season.league.slug}/seasons/${reg.season.id}/rounds/${r.id}/report`}
                          className={`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 ${
                            closed ? "opacity-60" : ""
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span className="w-10 text-right text-zinc-500">
                              R{r.roundNumber}
                            </span>
                            <span className="font-medium text-zinc-200">
                              {r.name}
                            </span>
                            {r.track && (
                              <span className="text-zinc-500">— {r.track}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-xs text-zinc-500">
                              {formatDateTime(r.startsAt)}
                            </span>
                            {w.status === "OPEN" && w.minutesRemaining != null && (
                              <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                closes in {formatCountdown(w.minutesRemaining)}
                              </span>
                            )}
                            {closed && (
                              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                closed
                              </span>
                            )}
                            <span className="text-orange-400">Report →</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
