import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getPitReferences } from "@/lib/pit-references";
import { savePitReference, deletePitReference } from "@/lib/actions/pit-references";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export const metadata = { title: "Pit references — Admin" };

const inp =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none";
const lbl = "block text-[11px] font-medium uppercase tracking-wider text-zinc-500";

export default async function PitReferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const rows = await getPitReferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pit references</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Measured pit-stop constants per car — and per track where the pit lane
          differs. The stint planner loads them with one click, so a stop is computed
          from the litres actually taken instead of one flat number.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-zinc-500">
          <strong className="text-zinc-400">How to measure:</strong> in a test session,
          run three clean laps for a reference, then drive through the pits without
          stopping, stop without service, stop for tyres only, and stop for tyres + a
          full tank. Time the sector that contains pit entry plus the following sector
          out — the difference to the clean reference is the loss. Stop&nbsp;&amp;&nbsp;go
          minus reference is the <em>lane loss</em>; tyres minus stop&nbsp;&amp;&nbsp;go
          is the <em>tyre time</em>; the rest divided by the litres taken is the{" "}
          <em>refuel rate</em>. Method: Johann Solowej.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">{ok}</div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{error}</div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Add / update an entry
        </h2>
        <form action={savePitReference} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Car *</label>
              <input name="car" required className={inp} placeholder="McLaren 720S GT3 EVO" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Track (empty = all tracks)</label>
              <input name="track" className={inp} placeholder="Spa-Francorchamps" />
            </div>
            <div>
              <label className={lbl}>Tank (L)</label>
              <input name="tankSizeL" className={inp} placeholder="110" />
            </div>
            <div>
              <label className={lbl}>Lane loss (s) *</label>
              <input name="laneLossSec" required className={inp} placeholder="41" />
            </div>
            <div>
              <label className={lbl}>Refuel (L/s) *</label>
              <input name="refuelLps" required className={inp} placeholder="2.5" />
            </div>
            <div>
              <label className={lbl}>Tyre change (s) *</label>
              <input name="tyreChangeSec" required className={inp} placeholder="20" />
            </div>
            <div>
              <label className={lbl}>Driver change (s)</label>
              <input name="driverChangeSec" className={inp} placeholder="30" />
            </div>
            <div>
              <label className={lbl}>Tyre wear (%/lap)</label>
              <input name="tyreWearPctPerLap" className={inp} placeholder="1.0" />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" name="tyreSequential" defaultChecked />
                tyres AFTER fuelling
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Measured by / when</label>
              <input name="source" className={inp} placeholder="Johann Solowej, 06.07.2026 test session" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Notes</label>
              <input name="notes" className={inp} placeholder="BoP 5% fuel reduction at the time" />
            </div>
          </div>
          <SubmitWithSpinner label="Save entry" />
          <p className="text-[11px] text-zinc-500">
            Saving the same car + track again overwrites that entry.
          </p>
        </form>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Library ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing measured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-2 pr-3">Car</th>
                  <th className="py-2 pr-3">Track</th>
                  <th className="py-2 pr-3 text-right">Tank</th>
                  <th className="py-2 pr-3 text-right">Lane</th>
                  <th className="py-2 pr-3 text-right">Refuel</th>
                  <th className="py-2 pr-3 text-right">Tyres</th>
                  <th className="py-2 pr-3 text-right">Swap</th>
                  <th className="py-2 pr-3 text-right">Wear</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                    <td className="py-2 pr-3 text-zinc-200">{r.car}</td>
                    <td className="py-2 pr-3 text-zinc-400">{r.track || "— all —"}</td>
                    <td className="py-2 pr-3 text-right text-zinc-400">{r.tankSizeL ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{r.laneLossSec} s</td>
                    <td className="py-2 pr-3 text-right">{r.refuelLps} L/s</td>
                    <td className="py-2 pr-3 text-right">
                      {r.tyreChangeSec} s
                      {!r.tyreSequential && (
                        <span className="ml-1 text-[10px] uppercase text-zinc-500">par</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-zinc-400">{r.driverChangeSec} s</td>
                    <td className="py-2 pr-3 text-right text-zinc-400">
                      {r.tyreWearPctPerLap != null ? `${r.tyreWearPctPerLap} %` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{r.source ?? "—"}</td>
                    <td className="py-2 text-right">
                      <details>
                        <summary className="cursor-pointer text-xs text-red-300/80 hover:text-red-200">
                          delete
                        </summary>
                        <form action={deletePitReference} className="mt-1">
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitWithSpinner
                            label="Confirm"
                            className="rounded border border-red-800 bg-zinc-900 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-zinc-800"
                          />
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        <Link href="/stint-planner" className="text-orange-400 hover:text-orange-300">
          → Stint planner
        </Link>
      </p>
    </div>
  );
}
