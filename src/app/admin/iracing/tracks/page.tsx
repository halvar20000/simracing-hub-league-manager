import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  refreshIracingTracks,
  addIracingTrackManually,
  deleteIracingTrack,
} from "@/lib/actions/iracing-tracks";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import TableFilter from "@/components/TableFilter";

export default async function IracingTracksAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;

  const [total, latest, all] = await Promise.all([
    prisma.iracingTrack.count(),
    prisma.iracingTrack.findFirst({
      orderBy: { cachedAt: "desc" },
      select: { cachedAt: true },
    }),
    prisma.iracingTrack.findMany({
      orderBy: [{ trackName: "asc" }, { configName: "asc" }],
    }),
  ]);

  // Manual rows start at 10001; JSON-seeded rows are 9001 – 9999. Used
  // below to label rows so admins can see which ones came from where.
  const MANUAL_BASE = 10001;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">iRacing track catalogue</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track list used by the Add / Edit round form&apos;s track
          typeahead. Seeded from a curated static file
          (<code>src/data/iracing-tracks.json</code>). iRacing retired
          legacy email+password API auth in December 2025 and paused new
          OAuth client registrations, so a live refresh isn&apos;t
          possible right now — extend the catalogue either by editing the
          JSON and clicking &quot;Seed from JSON&quot;, or by using the
          &quot;Add a track&quot; form below.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Updated: {ok} row{ok === "1" ? "" : "s"}.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-300">
              <span className="font-semibold">{total}</span> track variants
              cached.
            </p>
            <p className="text-xs text-zinc-500">
              Last update:{" "}
              {latest?.cachedAt
                ? new Date(latest.cachedAt).toLocaleString()
                : "never"}
            </p>
          </div>
          <form action={refreshIracingTracks}>
            <SubmitWithSpinner
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              label="Seed from JSON"
              pendingLabel="Seeding…"
            />
          </form>
        </div>
        <p className="text-[11px] text-zinc-500">
          The seed is an upsert keyed on <code>iracingTrackId</code>,
          so it&apos;s safe to run repeatedly — only new rows are added,
          existing rows refresh their <code>cachedAt</code>. Manually
          added rows (IDs ≥ {MANUAL_BASE}) are left alone by the seed.
        </p>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-base font-semibold">Add a track manually</h2>
        <p className="text-xs text-zinc-500">
          Use this when iRacing releases a new track and the seed file
          hasn&apos;t caught up yet. The new row gets a synthetic ID in
          the {MANUAL_BASE}+ range so it can&apos;t collide with the
          curated seed.
        </p>
        <form
          action={addIracingTrackManually}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="block min-w-[18rem] flex-1">
            <span className="mb-1 block text-xs text-zinc-400">
              Track name <span className="text-orange-400">*</span>
            </span>
            <input
              name="trackName"
              required
              placeholder="e.g. Hockenheimring Baden-Württemberg"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block min-w-[14rem] flex-1">
            <span className="mb-1 block text-xs text-zinc-400">
              Variant / config
            </span>
            <input
              name="configName"
              placeholder="e.g. Grand Prix"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Category</span>
            <select
              name="category"
              defaultValue=""
              className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">—</option>
              <option value="road">road</option>
              <option value="oval">oval</option>
              <option value="dirt_road">dirt_road</option>
              <option value="dirt_oval">dirt_oval</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold hover:bg-emerald-600"
          >
            Add track
          </button>
        </form>
      </section>

      {all.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              All cached tracks ({all.length})
            </h2>
            <TableFilter
              tableId="iracingTracksTable"
              placeholder="Filter…"
              className="w-56"
            />
          </div>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table id="iracingTracksTable" className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 w-16">ID</th>
                  <th className="px-3 py-2">Track</th>
                  <th className="px-3 py-2">Variant</th>
                  <th className="px-3 py-2 w-20">Source</th>
                  <th className="px-3 py-2 w-12 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {all.map((t) => {
                  const isManual = t.iracingTrackId >= MANUAL_BASE;
                  const filter =
                    `${t.trackName} ${t.configName ?? ""} ${t.category ?? ""}`.toLowerCase();
                  return (
                    <tr
                      key={t.iracingTrackId}
                      data-filter={filter}
                      className="border-t border-zinc-800 hover:bg-zinc-900"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs text-zinc-500">
                        {t.iracingTrackId}
                      </td>
                      <td className="px-3 py-1.5">{t.trackName}</td>
                      <td className="px-3 py-1.5 text-zinc-400">
                        {t.configName ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px]">
                        {isManual ? (
                          <span className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-cyan-300">
                            manual
                          </span>
                        ) : (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
                            seed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <form action={deleteIracingTrack}>
                          <input
                            type="hidden"
                            name="iracingTrackId"
                            value={t.iracingTrackId}
                          />
                          <button
                            type="submit"
                            className="rounded border border-red-900/40 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-900/30"
                            title={
                              isManual
                                ? "Delete this manual row."
                                : "Delete now. Will reappear on next 'Seed from JSON' unless you also remove it from the seed file."
                            }
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
