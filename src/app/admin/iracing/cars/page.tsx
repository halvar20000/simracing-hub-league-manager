import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  refreshIracingCars,
  addIracingCarManually,
  deleteIracingCar,
} from "@/lib/actions/iracing-cars";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import TableFilter from "@/components/TableFilter";

export default async function IracingCarsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;

  const [total, latest, all] = await Promise.all([
    prisma.iracingCar.count(),
    prisma.iracingCar.findFirst({
      orderBy: { cachedAt: "desc" },
      select: { cachedAt: true },
    }),
    prisma.iracingCar.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  // ID ranges:
  //   < 99001              : confirmed real iRacing IDs
  //   99001 – 99999        : best-effort seed entries (real ID unknown)
  //   ≥ 100001             : manually added by an admin
  const SYNTHETIC_SEED_BASE = 99001;
  const MANUAL_BASE = 100001;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">iRacing car catalogue</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Reference list of cars available in iRacing. Seeded from a
          curated static file
          (<code>src/data/iracing-cars.json</code>) — IDs &lt;{" "}
          {SYNTHETIC_SEED_BASE} are confirmed real iRacing car IDs
          extracted from past race-result imports; IDs {SYNTHETIC_SEED_BASE}
          –{MANUAL_BASE - 1} are best-effort entries whose real ID
          isn&apos;t yet known. iRacing retired legacy email+password API
          auth in December 2025 and paused new OAuth client
          registrations, so a live refresh isn&apos;t possible right now
          — extend the catalogue either by editing the JSON and clicking
          &quot;Seed from JSON&quot;, or by using the &quot;Add a
          car&quot; form below.
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
              <span className="font-semibold">{total}</span> cars cached.
            </p>
            <p className="text-xs text-zinc-500">
              Last update:{" "}
              {latest?.cachedAt
                ? new Date(latest.cachedAt).toLocaleString()
                : "never"}
            </p>
          </div>
          <form action={refreshIracingCars}>
            <SubmitWithSpinner
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              label="Seed from JSON"
              pendingLabel="Seeding…"
            />
          </form>
        </div>
        <p className="text-[11px] text-zinc-500">
          The seed is an upsert keyed on <code>iracingCarId</code>, so
          it&apos;s safe to run repeatedly — only new rows are added,
          existing rows refresh their <code>cachedAt</code>. Manually
          added rows (IDs ≥ {MANUAL_BASE}) are left alone by the seed.
        </p>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <h2 className="text-base font-semibold">Add a car manually</h2>
        <p className="text-xs text-zinc-500">
          Use this when iRacing releases a new car and the seed file
          hasn&apos;t caught up yet. The new row gets a synthetic ID in
          the {MANUAL_BASE}+ range so it can&apos;t collide with the
          curated seed.
        </p>
        <form
          action={addIracingCarManually}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="block min-w-[20rem] flex-1">
            <span className="mb-1 block text-xs text-zinc-400">
              Car name <span className="text-orange-400">*</span>
            </span>
            <input
              name="name"
              required
              placeholder="e.g. BMW M2 CS Racing"
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
              <option value="GT3">GT3</option>
              <option value="GT4">GT4</option>
              <option value="LMP2">LMP2</option>
              <option value="LMP3">LMP3</option>
              <option value="GTP">GTP</option>
              <option value="Touring">Touring</option>
              <option value="Porsche Cup">Porsche Cup</option>
              <option value="Open Wheel">Open Wheel</option>
              <option value="Stock Car">Stock Car</option>
              <option value="Prototype">Prototype</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold hover:bg-emerald-600"
          >
            Add car
          </button>
        </form>
      </section>

      {all.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              All cached cars ({all.length})
            </h2>
            <TableFilter
              tableId="iracingCarsTable"
              placeholder="Filter…"
              className="w-56"
            />
          </div>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table id="iracingCarsTable" className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2 w-16">ID</th>
                  <th className="px-3 py-2">Car</th>
                  <th className="px-3 py-2 w-28">Category</th>
                  <th className="px-3 py-2 w-24">Source</th>
                  <th className="px-3 py-2 w-12 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => {
                  let source: "real" | "best-effort" | "manual";
                  if (c.iracingCarId >= MANUAL_BASE) source = "manual";
                  else if (c.iracingCarId >= SYNTHETIC_SEED_BASE)
                    source = "best-effort";
                  else source = "real";
                  const filter =
                    `${c.name} ${c.category ?? ""}`.toLowerCase();
                  return (
                    <tr
                      key={c.iracingCarId}
                      data-filter={filter}
                      className="border-t border-zinc-800 hover:bg-zinc-900"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs text-zinc-500">
                        {c.iracingCarId}
                      </td>
                      <td className="px-3 py-1.5">{c.name}</td>
                      <td className="px-3 py-1.5 text-zinc-400">
                        {c.category ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px]">
                        {source === "real" && (
                          <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-emerald-300">
                            iRacing ID
                          </span>
                        )}
                        {source === "best-effort" && (
                          <span
                            className="rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-300"
                            title="Real iRacing ID unknown — using a synthetic placeholder. Replace by deleting + re-adding once the real ID is known."
                          >
                            best-effort
                          </span>
                        )}
                        {source === "manual" && (
                          <span className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-cyan-300">
                            manual
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <form action={deleteIracingCar}>
                          <input
                            type="hidden"
                            name="iracingCarId"
                            value={c.iracingCarId}
                          />
                          <button
                            type="submit"
                            className="rounded border border-red-900/40 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-900/30"
                            title={
                              source === "manual"
                                ? "Delete this manually-added row."
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
