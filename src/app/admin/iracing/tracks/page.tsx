import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { refreshIracingTracks } from "@/lib/actions/iracing-tracks";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function IracingTracksAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;

  const [total, latest, sample] = await Promise.all([
    prisma.iracingTrack.count(),
    prisma.iracingTrack.findFirst({
      orderBy: { cachedAt: "desc" },
      select: { cachedAt: true },
    }),
    prisma.iracingTrack.findMany({
      orderBy: [{ trackName: "asc" }, { configName: "asc" }],
      take: 20,
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">iRacing track catalogue</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Cached snapshot of iRacing&apos;s /data/track/get response. Used by
          the Add / Edit round form&apos;s track typeahead. Refresh manually
          when iRacing adds new content, or rely on the weekly cron.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Refreshed: {ok} tracks upserted.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-300">
              <span className="font-semibold">{total}</span> track variants
              cached.
            </p>
            <p className="text-xs text-zinc-500">
              Last refresh:{" "}
              {latest?.cachedAt
                ? new Date(latest.cachedAt).toLocaleString()
                : "never"}
            </p>
          </div>
          <form action={refreshIracingTracks}>
            <SubmitWithSpinner
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              label="Refresh from iRacing"
              pendingLabel="Refreshing…"
            />
          </form>
        </div>
        <p className="text-[11px] text-zinc-500">
          Requires <code>IRACING_EMAIL</code> + <code>IRACING_PASSWORD</code> env
          vars. If iRacing demands captcha / MFA, log in once via
          members.iracing.com to clear the prompt, then retry.
        </p>
      </section>

      {sample.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">
            Sample (first 20 by name)
          </h2>
          <ul className="space-y-1 text-xs text-zinc-400">
            {sample.map((t) => (
              <li key={t.iracingTrackId} className="font-mono">
                <span className="text-zinc-500">
                  #{t.iracingTrackId.toString().padStart(4, " ")}
                </span>{" "}
                {t.trackName}
                {t.configName ? (
                  <span className="text-zinc-500"> — {t.configName}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
