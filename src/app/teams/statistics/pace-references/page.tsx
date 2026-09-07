import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import { getPaceReferences } from "@/lib/pace-references";
import {
  savePaceReference,
  deletePaceReference,
} from "@/lib/actions/pace-references";
import { fmtPaceSec, targetLapSec } from "@/lib/pace-reference";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import {
  getPaceViewer,
  canUsePaceLibrary,
  canEditPaceReference,
} from "@/lib/pace-reference-access";

export const metadata: Metadata = pageMetadata({
  title: "Pace-Referenzen",
  description:
    "Welche Rundenzeit ein iRating wert ist, je Fahrzeugklasse und Strecke — die Grundlage der Relativperformance im De-briefing.",
  url: "/teams/statistics/pace-references",
});

const inp =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none";
const lbl =
  "block text-[11px] font-medium uppercase tracking-wider text-zinc-500";
const card = "rounded border border-zinc-800 bg-zinc-900 p-4";

// Stamps `_cls` on the copied file: WHEN the curve was taken (which is what
// decides its season — the file itself only carries an internal season_id)
// and which page it came from. An older bookmarklet still works; the label
// then falls back to today's date instead.
const BOOKMARKLET = `javascript:(async()=>{const e=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('pace_analysis')).pop();if(!e){alert('Open the Pace Analysis chart first (scroll to it), then click again.');return}const j=await fetch(e).then(r=>r.json());j._cls={grabbed_at:new Date().toISOString(),page_title:document.title,url:location.href};await navigator.clipboard.writeText(JSON.stringify(j));alert('Copied: '+(j.line||[]).length+' points, event_type '+j.event_type+', week '+j.race_week_num);})()`;

export default async function PaceReferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const viewer = await getPaceViewer();
  if (!viewer) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        "/teams/statistics/pace-references"
      )}`
    );
  }
  if (!canUsePaceLibrary(viewer)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">Nur für Teamfahrer</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Die Pace-Referenzen stehen jedem offen, der in einem CLS-Team gemeldet
          ist. Wenn du in einem Team fährst und das hier siehst, fehlt
          wahrscheinlich noch die freigegebene Meldung.
        </p>
        <Link
          href="/teams/statistics"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Team-Statistik
        </Link>
      </main>
    );
  }
  const canEdit = canEditPaceReference(viewer);
  const { ok, error } = await searchParams;
  const rows = await getPaceReferences();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="text-sm">
        <Link
          href="/teams/statistics"
          className="text-zinc-400 hover:text-[#ff6b35]"
        >
          ← Team-Statistik
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Pace-Referenzen</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Welche Rundenzeit ein iRating hier wert ist, je Fahrzeugklasse und
          Strecke. Ein Stintplan, der auf{" "}
          <strong className="text-zinc-300">Official race</strong> steht, wählt
          eine dieser Kurven — und das De-briefing misst danach jeden Fahrer an
          der Zeit, die sein <em>eigenes</em> Rating erwarten liess, statt am
          schnellsten Mann eines Feldes, das er sich nicht ausgesucht hat.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-zinc-500">
          <strong className="text-zinc-400">Woher die Zahlen kommen:</strong> die
          iRacing-Mitgliederseite, Serie → <em>Series Insights</em> →{" "}
          <em>Pace Analysis</em>. Rennwoche, Fahrzeugklasse und <em>Race</em>{" "}
          wählen, dann die Kurve mit dem Bookmarklet unten kopieren und hier
          einfügen. CLS holt sie nie selbst: die Quelldatei liegt in einem
          privaten Bucket hinter einer Signatur, die nach einer Stunde abläuft —
          das bleibt ein Export von Hand aus deiner eigenen eingeloggten
          Sitzung.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-zinc-500">
          Die Bibliothek ist teamübergreifend: eine Kurve für GT3 in Spa ist
          dieselbe, egal wer sie nachschlägt. Jeder, der in einem Team gemeldet
          ist, kann hier nachsehen und neue Kurven anlegen.{" "}
          {canEdit
            ? "Als Admin kannst du bestehende Kurven auch ändern und löschen."
            : "Bestehende Kurven ändern oder löschen kann nur ein Admin — sie hängen an bereits veröffentlichten Auswertungen."}
        </p>
      </div>

      {ok && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          {ok}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className={card}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Der Ein-Klick-Export
        </h2>
        <p className="mb-2 text-xs text-zinc-400">
          Lege in deinem Browser ein neues Lesezeichen an und füge die ganze
          Zeile unten als dessen Adresse ein — eine Webseite darf dir kein
          Skript-Lesezeichen in die Hand geben, dieser eine Schritt bleibt
          deiner. Dann auf dem Pace-Analysis-Diagramm, nachdem du dorthin
          gescrollt hast und es geladen ist, einmal auf das Lesezeichen klicken:
          die ganze Kurve liegt in der Zwischenablage, bereit für den Kasten
          weiter unten — mitsamt dem Datum, an dem du sie geholt hast, woraus
          sich Saison und Rennwoche der Bezeichnung ergeben.
        </p>
        <textarea
          readOnly
          rows={4}
          className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400"
          defaultValue={BOOKMARKLET}
        />
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Kurve hinzufügen
        </h2>
        <form action={savePaceReference} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Fahrzeugklasse *</label>
              <input name="carClass" required className={inp} placeholder="GT3 Class" />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Strecke *</label>
              <input
                name="track"
                required
                className={inp}
                placeholder="Circuit de Spa-Francorchamps"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Bezeichnung</label>
              <input
                name="label"
                className={inp}
                placeholder="Leer lassen — schreibt sich selbst"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Leer gelassen setzt sie sich aus Klasse, Strecke, Saison,
                Rennwoche und Session zusammen — Saison und Woche aus der
                eingefügten Datei, nicht aus dem Gedächtnis.
              </p>
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
              <label className={lbl}>Quelle</label>
              <input
                name="source"
                className={inp}
                placeholder="Series Insights, 06.09."
              />
            </div>
          </div>
          <div>
            <label className={lbl}>Kurve als JSON *</label>
            <textarea
              name="points"
              rows={4}
              className={`${inp} font-mono text-xs`}
              placeholder='Die ganze Datei einfügen — {"season_id":6301,…,"line":[{"irating":200,"lap_time":125.066},…]} — oder nur das Array.'
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Saison, Rennwoche, Fahrzeugklassen-ID und Session-Typ werden aus
              der eingefügten Datei gelesen, wenn sie darin stehen.
            </p>
          </div>
          <SubmitWithSpinner label="Kurve speichern" />
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Bibliothek <span className="font-normal text-zinc-500">{rows.length}</span>
          </h2>
          {rows.length > 0 && (
            <a
              href="/api/export/pace-references"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              title="Jede Kurve in einer Arbeitsmappe — ein Blatt je Kurve, plus ein Info-Blatt."
            >
              ⬇ Alle exportieren (.xlsx)
            </a>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            Noch nichts da. Füge oben die erste Kurve ein.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const at = (ir: number) =>
                fmtPaceSec(targetLapSec(r.points, ir)?.sec ?? null);
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
                    {r.carClass} · {r.track} · {r.points.length} Punkte
                    {r.iracingSeasonId != null && <> · Saison {r.iracingSeasonId}</>}
                    {r.iracingRaceWeek != null && <> · Woche {r.iracingRaceWeek + 1}</>}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    1000 → <span className="text-zinc-300">{at(1000)}</span> · 2000 →{" "}
                    <span className="text-zinc-300">{at(2000)}</span> · 5000 →{" "}
                    <span className="text-zinc-300">{at(5000)}</span> · 10000 →{" "}
                    <span className="text-cyan-300">{at(10000)}</span>
                  </p>
                  {(r.source || r.updatedByName) && (
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {r.source}
                      {r.source && r.updatedByName && " · "}
                      {r.updatedByName && (
                        <>
                          zuletzt {r.updatedByName},{" "}
                          {r.updatedAt.toLocaleDateString("de-DE")}
                        </>
                      )}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/export/pace-references?id=${r.id}`}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      title="Diese Kurve als Tabelle: iRating, Rundenzeit in Sekunden und als Rundenzeit."
                    >
                      ⬇ .xlsx
                    </a>
                  </div>

                  {/* Editing lives behind one click, and the delete button
                      lives inside it: a row in a shared library should not
                      offer "Löschen" next to "Download". */}
                  {canEdit && (
                    <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/60">
                      <summary className="cursor-pointer px-3 py-1.5 text-xs text-zinc-400 hover:text-orange-300">
                        Bearbeiten
                      </summary>
                      <div className="border-t border-zinc-800 p-3">
                        <form action={savePaceReference} className="space-y-3">
                          <input type="hidden" name="id" value={r.id} />
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div className="sm:col-span-2">
                              <label className={lbl}>Fahrzeugklasse *</label>
                              <input
                                name="carClass"
                                required
                                defaultValue={r.carClass}
                                className={inp}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={lbl}>Strecke *</label>
                              <input
                                name="track"
                                required
                                defaultValue={r.track}
                                className={inp}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={lbl}>Bezeichnung</label>
                              <input
                                name="label"
                                defaultValue={r.label}
                                className={inp}
                              />
                              <p className="mt-1 text-[11px] text-zinc-500">
                                Feld leeren und speichern → wird neu
                                zusammengesetzt, mit der Saison des Tages, an
                                dem die Kurve angelegt wurde.
                              </p>
                            </div>
                            <div>
                              <label className={lbl}>Session</label>
                              <select
                                name="sessionType"
                                className={inp}
                                defaultValue={r.sessionType}
                              >
                                <option value="RACE">Race</option>
                                <option value="QUALIFY">Qualifying</option>
                                <option value="PRACTICE">Practice</option>
                                <option value="TIME_TRIAL">Time trial</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className={lbl}>Quelle</label>
                              <input
                                name="source"
                                defaultValue={r.source ?? ""}
                                className={inp}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={lbl}>Notiz</label>
                              <input
                                name="notes"
                                defaultValue={r.notes ?? ""}
                                className={inp}
                              />
                            </div>
                            <div>
                              <label className={lbl}>Saison-ID</label>
                              <input
                                name="iracingSeasonId"
                                defaultValue={r.iracingSeasonId ?? ""}
                                className={inp}
                              />
                            </div>
                            <div>
                              <label className={lbl}>Rennwoche (0-basiert)</label>
                              <input
                                name="iracingRaceWeek"
                                defaultValue={r.iracingRaceWeek ?? ""}
                                className={inp}
                              />
                            </div>
                            <div>
                              <label className={lbl}>Klassen-ID</label>
                              <input
                                name="iracingCarClassId"
                                defaultValue={r.iracingCarClassId ?? ""}
                                className={inp}
                              />
                            </div>
                          </div>
                          <div>
                            <label className={lbl}>Kurve ersetzen (optional)</label>
                            <textarea
                              name="points"
                              rows={3}
                              className={`${inp} font-mono text-xs`}
                              placeholder={`Leer lassen — dann bleiben die ${r.points.length} vorhandenen Punkte unverändert. Nur einfügen, wenn die Kurve selbst neu gemessen wurde.`}
                            />
                          </div>
                          <SubmitWithSpinner label="Änderungen speichern" />
                        </form>

                        <form
                          action={deletePaceReference}
                          className="mt-3 border-t border-zinc-800 pt-3"
                        >
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40">
                            Kurve löschen
                          </button>
                          <span className="ml-2 text-[11px] text-zinc-600">
                            Stintpläne, die auf sie zeigen, verlieren ihre
                            Referenz.
                          </span>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        <Link href="/stint-planner" className="text-orange-400 hover:text-orange-300">
          → Stint Planner
        </Link>
      </p>
    </main>
  );
}
