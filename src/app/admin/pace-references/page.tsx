import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getPaceReferences } from "@/lib/pace-references";
import { savePaceReference, deletePaceReference } from "@/lib/actions/pace-references";
import { fmtPaceSec, targetLapSec } from "@/lib/pace-reference";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export const metadata = { title: "Pace references — Admin" };

const inp =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none";
const lbl = "block text-[11px] font-medium uppercase tracking-wider text-zinc-500";

const BOOKMARKLET = `javascript:(async()=>{const e=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('pace_analysis')).pop();if(!e){alert('Open the Pace Analysis chart first (scroll to it), then click again.');return}const j=await fetch(e).then(r=>r.json());await navigator.clipboard.writeText(JSON.stringify(j));alert('Copied: '+(j.line||[]).length+' points, event_type '+j.event_type+', week '+j.race_week_num);})()`;

export default async function PaceReferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const rows = await getPaceReferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pace references</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          What lap time an iRating is worth, per car class and track. A stint plan
          set to <strong className="text-zinc-300">Official race</strong> picks one of
          these, and the debrief then measures every driver against the time his own
          iRating was expected to produce — instead of against the fastest man on a
          grid he never chose.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-zinc-500">
          <strong className="text-zinc-400">Where the numbers come from:</strong> the
          iRacing members site, series page →{" "}
          <em>Series Insights</em> → <em>Pace Analysis</em>. Pick the race week, car
          class and <em>Race</em>, then copy the curve with the bookmarklet below and
          paste it here. CLS never fetches this itself: the source file sits in a
          private bucket behind a one-hour signed URL, so this stays a manual export
          from your own logged-in session.
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">{ok}</div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{error}</div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-orange-300">
          The one-click export
        </h2>
        <p className="mb-2 text-xs text-zinc-400">
          Make a new bookmark in your browser and paste the whole line below as its
          address (a browser will not let a page hand you a script bookmark, so this
          one step is yours). Then, on the Pace Analysis chart — after scrolling to it,
          so it has loaded — click the bookmark once and the whole curve is on your
          clipboard, ready to paste into the box below.
        </p>
        <textarea
          readOnly
          rows={4}
          className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400"
          defaultValue={BOOKMARKLET}
        />
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Add a curve
        </h2>
        <form action={savePaceReference} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Car class *</label>
              <input name="carClass" required className={inp} placeholder="GT3 Class" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Track *</label>
              <input name="track" required className={inp} placeholder="Circuit de Spa-Francorchamps" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Label</label>
              <input name="label" className={inp} placeholder="GT Sprint · Spa · 2026 S3 W12" />
            </div>
            <div>
              <label className={lbl}>Session</label>
              <select name="sessionType" className={inp} defaultValue="RACE">
                <option value="RACE">Race</option>
                <option value="QUALIFY">Qualifying</option>
                <option value="PRACTICE">Practice</option>
                <option value="TIME_TRIAL">Time trial</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Source</label>
              <input name="source" className={inp} placeholder="Series Insights, 06.09." />
            </div>
          </div>
          <div>
            <label className={lbl}>Curve JSON *</label>
            <textarea
              name="points"
              rows={4}
              className={`${inp} font-mono text-xs`}
              placeholder='Paste the whole file — {"season_id":6301,…,"line":[{"irating":200,"lap_time":125.066},…]} — or just the array.'
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Season, race week, car class id and the session type are read out of the
              pasted file when they are in it.
            </p>
          </div>
          <SubmitWithSpinner label="Save curve" />
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Library <span className="font-normal text-zinc-500">{rows.length}</span>
          </h2>
          {rows.length > 0 && (
            <a
              href="/api/export/pace-references"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              title="Every curve in one workbook — one sheet each, plus an Info sheet."
            >
              ⬇ Export all (.xlsx)
            </a>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            Nothing yet. Paste the first curve above.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const at = (ir: number) => fmtPaceSec(targetLapSec(r.points, ir)?.sec ?? null);
              return (
                <li
                  key={r.id}
                  className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-zinc-100">{r.label}</span>
                    <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                      {r.sessionType}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    {r.carClass} · {r.track} · {r.points.length} points
                    {r.iracingSeasonId != null && (
                      <> · season {r.iracingSeasonId}</>
                    )}
                    {r.iracingRaceWeek != null && <> · week {r.iracingRaceWeek + 1}</>}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    1000 → <span className="text-zinc-300">{at(1000)}</span> · 2000 →{" "}
                    <span className="text-zinc-300">{at(2000)}</span> · 5000 →{" "}
                    <span className="text-zinc-300">{at(5000)}</span> · 10000 →{" "}
                    <span className="text-cyan-300">{at(10000)}</span>
                  </p>
                  {r.source && <p className="mt-1 text-[11px] text-zinc-600">{r.source}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/export/pace-references?id=${r.id}`}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      title="This curve as a spreadsheet: iRating, lap time in seconds and as a lap time."
                    >
                      ⬇ .xlsx
                    </a>
                    <form action={deletePaceReference}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
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
