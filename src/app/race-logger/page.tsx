import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import CopyTextButton from "@/components/CopyTextButton";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import { regenerateRaceLoggerToken, revokeRaceLoggerToken } from "@/lib/actions/race-logger";
import { RACE_LOGGER_EXE_URL, RACE_LOGGER_ZIP_URL } from "@/lib/race-logger";
import { pageMetadata } from "@/lib/og";

export const metadata = pageMetadata({
  title: "Race Logger",
  description:
    "Run the CAS race logger on your PC during a race — the log is sent to CLS automatically and feeds Driver of the Day.",
  url: "/race-logger",
});

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(d);
}

export default async function RaceLoggerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/race-logger");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { raceLoggerToken: true, raceLoggerTokenCreatedAt: true },
  });
  if (!user) redirect("/api/auth/signin");

  const uploads = await prisma.raceLogUpload.findMany({
    where: { uploadedById: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: {
      round: {
        select: {
          id: true,
          name: true,
          roundNumber: true,
          seasonId: true,
          season: { select: { league: { select: { slug: true, name: true } } } },
        },
      },
    },
  });

  const token = user.raceLoggerToken;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Race Logger</h1>
        <p className="mt-2 text-sm text-zinc-400">
          A small program for your Windows PC that records every lap, pit stop, overtake and
          flag of an iRacing race into one file. It is the same logger the broadcast uses —
          just without any OBS overlays. Start it before the race, leave it running, done:
          the log lands here automatically and CLS uses it for{" "}
          <strong className="text-zinc-200">Driver of the Day</strong> and the stint-planner
          race analysis.
        </p>
      </div>

      {/* --- 1. Download ------------------------------------------------- */}
      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">1. Download</h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={RACE_LOGGER_EXE_URL}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
          >
            ⬇ RaceLogger.exe (Windows)
          </a>
          <a
            href={RACE_LOGGER_ZIP_URL}
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            Python source (.zip)
          </a>
        </div>
        <p className="text-[11px] text-zinc-500">
          The .exe needs nothing installed — no Python, no OBS. Windows SmartScreen may warn
          about an unknown publisher on the first start (“More info” → “Run anyway”); the
          build comes straight from the public overlays repository. The source zip is for
          anyone who already runs the overlay suite or prefers Python.
        </p>
      </section>

      {/* --- 2. Token ----------------------------------------------------- */}
      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">2. Your personal upload key</h2>
        {token ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-emerald-300">
                {token}
              </code>
              <CopyTextButton text={token} label="Copy key" />
            </div>
            <p className="text-[11px] text-zinc-500">
              Created {user.raceLoggerTokenCreatedAt ? fmt(user.raceLoggerTokenCreatedAt) : "—"}.
              Treat it like a password — it lets a program upload race logs as you, nothing
              else. Lost it or shared it by accident? Generate a new one; the old key stops
              working immediately.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <form action={regenerateRaceLoggerToken}>
                <SubmitWithSpinner
                  label="Generate a new key"
                  className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                />
              </form>
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                  Danger zone
                </summary>
                <form action={revokeRaceLoggerToken} className="mt-2">
                  <SubmitWithSpinner
                    label="Switch auto-upload off (delete key)"
                    className="rounded border border-red-900 bg-red-950 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900"
                  />
                </form>
              </details>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              You do not have a key yet. Generate one, then paste it into the logger once.
            </p>
            <form action={regenerateRaceLoggerToken}>
              <SubmitWithSpinner label="Generate my key" />
            </form>
          </>
        )}
      </section>

      {/* --- 3. Setup ----------------------------------------------------- */}
      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">3. Set it up (once)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
          <li>Start <code className="text-zinc-200">RaceLogger.exe</code>. A black console window stays open — that is the logger running.</li>
          <li>
            Open{" "}
            <code className="text-zinc-200">http://localhost:5009/league</code> in your
            browser (the logger prints the link too).
          </li>
          <li>
            Paste the key from step 2, leave the CLS address as it is, tick{" "}
            <em>send logs automatically</em> and hit <em>Test connection</em> — it should
            greet you by name.
          </li>
          <li>Done. From now on: start the logger before you join a race, and leave it running until the results screen.</li>
        </ol>
        <p className="text-[11px] text-zinc-500">
          Only <strong>race</strong> sessions are recorded — practice and qualifying are
          ignored. The file is always kept on your PC as well (
          <code>logs\…_race.jsonl</code>), so nothing is lost if the upload fails; the logger
          page has a re-send button.
        </p>
      </section>

      {/* --- 4. Uploads --------------------------------------------------- */}
      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-lg font-semibold">Your uploads</h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2">Uploaded</th>
                  <th>Track</th>
                  <th>Session</th>
                  <th className="text-right">Laps</th>
                  <th>Round</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                    <td className="py-2 text-zinc-400">{fmt(u.createdAt)}</td>
                    <td>
                      {u.track ?? "—"}
                      {u.trackConfig ? (
                        <span className="text-zinc-500"> · {u.trackConfig}</span>
                      ) : null}
                    </td>
                    <td className="text-zinc-400">{u.sessionName ?? "RACE"}</td>
                    <td className="text-right text-zinc-400">{u.lapEvents}</td>
                    <td>
                      {u.round ? (
                        <Link
                          className="text-orange-400 hover:text-orange-300"
                          href={`/leagues/${u.round.season.league.slug}/seasons/${u.round.seasonId}/rounds/${u.round.id}`}
                        >
                          R{u.round.roundNumber} {u.round.name}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">not matched yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Questions or a log that never arrived? <Link href="/contact" className="text-orange-400 hover:text-orange-300">Get in touch</Link>.
      </p>
    </div>
  );
}
