"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  makeLiveryWorkerToken,
  saveLiveryDesign,
  startLiveryBuild,
  uploadLiveryLogo,
} from "@/lib/actions/livery";
import type { Design, Job, LiveryCar } from "@/lib/livery";

type Props = {
  design: Design | null;
  cars: LiveryCar[];
  hilfe: Record<string, string>;
  job: (Omit<Job, "design"> & { design?: undefined }) | null;
  worker: { online: boolean; seen: number; hasToken: boolean };
  now: number;
};

const SEL_KEY = "cls_livery_sel";
const box = "rounded-lg border border-zinc-800 bg-zinc-900/60 p-4";
const btn = "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50";
const btnMain = "rounded-md bg-orange-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-orange-400 disabled:opacity-50";
const input = "rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm";

export default function LiveryDesigner({ design, cars, hilfe, job, worker, now }: Props) {
  const router = useRouter();
  const [D, setD] = useState<Design | null>(design);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(() => new Set(cars.map((c) => c.key)));
  const [token, setToken] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [nc, setNc] = useState({ name: "", hex: "#2a2a2a" });

  // remembered car selection (per browser)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SEL_KEY) ?? "null");
      if (Array.isArray(s)) setSel(new Set(s.filter((k: string) => cars.some((c) => c.key === k))));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const keepSel = (s: Set<string>) => {
    setSel(s);
    try {
      localStorage.setItem(SEL_KEY, JSON.stringify([...s]));
    } catch {}
  };

  // fresh server data while nothing is being edited
  useEffect(() => {
    if (!dirty) setD(design);
  }, [design, dirty]);

  const busy = !!job && (job.state === "queued" || job.state === "running");
  useEffect(() => {
    const t = setInterval(() => router.refresh(), busy ? 3000 : 20000);
    return () => clearInterval(t);
  }, [busy, router]);

  const usedColors = useMemo(() => new Set(Object.values(D?.farbrollen ?? {})), [D]);

  if (!D) {
    return (
      <div className={box}>
        <p className="text-sm">
          Der Bau-Server hat sich noch nicht gemeldet. Erst einen Schlüssel erzeugen und auf dem Unraid eintragen
          (siehe unten), dann erscheint hier das Design.
        </p>
        <WorkerBox worker={worker} now={now} token={token} onToken={() => start(async () => {
          const r = await makeLiveryWorkerToken();
          if (r.token) setToken(r.token);
        })} />
      </div>
    );
  }

  const edit = (f: (d: Design) => Design) => {
    setD((d) => (d ? f(structuredClone(d)) : d));
    setDirty(true);
  };
  const show = (text: string, err?: boolean) => setMsg({ text, err });

  const save = () =>
    start(async () => {
      const r = await saveLiveryDesign(D);
      if (!r.ok) return show(r.error ?? "Fehler", true);
      setDirty(false);
      show("Gespeichert");
      router.refresh();
    });
  const build = () =>
    start(async () => {
      if (!sel.size) return show("Kein Auto angehakt", true);
      const r = await startLiveryBuild(D, [...sel]);
      if (!r.ok) return show(r.error ?? "Fehler", true);
      setDirty(false);
      show(worker.online ? "Bau gestartet …" : "Auftrag gespeichert – der Bau-Server ist gerade nicht erreichbar, er baut, sobald er wieder da ist.");
      router.refresh();
    });
  const upload = (form: HTMLFormElement) =>
    start(async () => {
      if (dirty) {
        const s = await saveLiveryDesign(D);
        if (!s.ok) return show(s.error ?? "Fehler", true);
        setDirty(false);
      }
      const r = await uploadLiveryLogo(new FormData(form));
      if (!r.ok) return show(r.error ?? "Fehler", true);
      form.reset();
      show("Logo hochgeladen");
      router.refresh();
    });

  const colorNames = Object.keys(D.farben);
  const logoNames = Object.keys(D.logos);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 py-2">
        <button className={btn} disabled={pending || !dirty} onClick={save}>
          Speichern
        </button>
        <button className={btnMain} disabled={pending || busy} onClick={build}>
          Speichern &amp; {sel.size} Auto{sel.size === 1 ? "" : "s"} bauen
        </button>
        {dirty && <span className="text-xs text-amber-400">ungespeicherte Änderungen</span>}
        {msg && <span className={`text-sm ${msg.err ? "text-red-400" : "text-emerald-400"}`}>{msg.text}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={box}>
          <h2 className="mb-2 font-semibold">Flächen</h2>
          {Object.keys(D.farbrollen).map((r) => (
            <div key={r} className="flex flex-wrap items-center gap-2 py-1">
              <span className="w-32 text-sm">{r}</span>
              <span className="h-5 w-5 rounded border border-zinc-600" style={{ background: D.farben[D.farbrollen[r]] }} />
              <select className={input} value={D.farbrollen[r]} onChange={(e) => edit((d) => ((d.farbrollen[r] = e.target.value), d))}>
                {colorNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">{hilfe[r]}</span>
            </div>
          ))}
        </section>

        <section className={box}>
          <h2 className="mb-2 font-semibold">Logo-Plätze</h2>
          {Object.keys(D.logorollen).map((r) => (
            <div key={r} className="flex flex-wrap items-center gap-2 py-1">
              <span className="w-32 text-sm">{r}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={D.logos[D.logorollen[r]]} alt="" className="h-7 w-16 rounded bg-zinc-700 object-contain" />
              <select className={input} value={D.logorollen[r]} onChange={(e) => edit((d) => ((d.logorollen[r] = e.target.value), d))}>
                {logoNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">{hilfe[r]}</span>
            </div>
          ))}
        </section>

        <section className={box}>
          <h2 className="mb-2 font-semibold">Farben</h2>
          {colorNames.map((n) => (
            <div key={n} className="flex items-center gap-2 py-1">
              <input type="color" value={D.farben[n]} onChange={(e) => edit((d) => ((d.farben[n] = e.target.value.toUpperCase()), d))} />
              <span className="flex-1 text-sm">{n}</span>
              <span className="text-xs text-zinc-500">{D.farben[n]}</span>
              {usedColors.has(n) ? (
                <span className="text-xs text-zinc-500">in Benutzung</span>
              ) : (
                <button className={btn} onClick={() => edit((d) => (delete d.farben[n], d))}>
                  Entfernen
                </button>
              )}
            </div>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={input} placeholder="Name, z. B. Mattschwarz" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
            <input type="color" value={nc.hex} onChange={(e) => setNc({ ...nc, hex: e.target.value })} />
            <button
              className={btn}
              onClick={() => {
                const n = nc.name.trim();
                if (!n || n in D.farben) return show("Name fehlt oder gibt es schon", true);
                edit((d) => ((d.farben[n] = nc.hex.toUpperCase()), d));
                setNc({ name: "", hex: nc.hex });
              }}
            >
              + Farbe
            </button>
          </div>
        </section>

        <section className={box}>
          <h2 className="mb-2 font-semibold">Logos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {logoNames.map((n) => (
              <div key={n} className="flex items-center gap-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={D.logos[n]} alt="" className="h-7 w-16 rounded bg-zinc-700 object-contain" />
                <span className="truncate">{n}</span>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              upload(e.currentTarget);
            }}
          >
            <input className={input} name="name" placeholder="Name des Logos" required />
            <input name="file" type="file" accept="image/png" required className="text-sm" />
            <button className={btn} disabled={pending}>
              Hochladen
            </button>
          </form>
          <p className="mt-1 text-xs text-zinc-500">PNG mit Transparenz, Logo aufrecht. Wird in jeden Platz eingepasst.</p>
        </section>
      </div>

      <section className={box}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Autos</h2>
          <span className="text-xs text-zinc-500">Gebaut werden nur die angehakten (Farben und Logos gelten für alle).</span>
          <button className={btn} onClick={() => keepSel(new Set(cars.map((c) => c.key)))}>
            Alle
          </button>
          <button className={btn} onClick={() => keepSel(new Set())}>
            Keine
          </button>
        </div>
        {job && <JobBox job={job} now={now} online={worker.online} />}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((c) => (
            <div key={c.key} className="rounded-md border border-zinc-800 p-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={sel.has(c.key)}
                  onChange={(e) => {
                    const s = new Set(sel);
                    if (e.target.checked) s.add(c.key);
                    else s.delete(c.key);
                    keepSel(s);
                  }}
                />
                <b>{c.name}</b>
              </label>
              <div className="text-xs text-zinc-500">
                {c.proam ? "Pro + Am" : "ohne Pro/Am (eine Datei)"} ·{" "}
                {c.stand ? new Date(c.stand * 1000).toLocaleString("de-DE") : "noch nicht gebaut"}
              </div>
              {c.vorschau && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.vorschau} alt="" className="mt-1 w-full cursor-zoom-in rounded bg-black" onClick={() => setBig(c.vorschau)} />
              )}
            </div>
          ))}
        </div>
      </section>

      <WorkerBox worker={worker} now={now} token={token} onToken={() => start(async () => {
        const r = await makeLiveryWorkerToken();
        if (r.token) setToken(r.token);
      })} />

      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="" className="max-h-full max-w-full" />
        </div>
      )}
    </div>
  );
}

function JobBox({ job, now, online }: { job: NonNullable<Props["job"]>; now: number; online: boolean }) {
  const label =
    job.state === "queued"
      ? online
        ? "wartet auf den Bau-Server …"
        : "wartet – der Bau-Server ist gerade nicht erreichbar"
      : job.state === "running"
        ? `baut seit ${Math.round((now - (job.started ?? job.created)) / 1000)} s …`
        : job.state === "done"
          ? `fertig ${job.ended ? new Date(job.ended).toLocaleTimeString("de-DE") : ""}`
          : "mit Fehler beendet";
  return (
    <div className="rounded-md bg-zinc-950 p-2 text-xs">
      <div className={job.state === "error" ? "text-red-400" : "text-zinc-300"}>
        Letzter Bau ({job.cars.length} Auto{job.cars.length === 1 ? "" : "s"}, von {job.by}): {label}
      </div>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-zinc-500">{job.log.join("\n")}</pre>
    </div>
  );
}

function WorkerBox({
  worker,
  now,
  token,
  onToken,
}: {
  worker: Props["worker"];
  now: number;
  token: string | null;
  onToken: () => void;
}) {
  return (
    <section className={`${box} text-sm`}>
      <h2 className="mb-1 font-semibold">Bau-Server (Unraid)</h2>
      <p className={worker.online ? "text-emerald-400" : "text-zinc-400"}>
        {worker.online
          ? "verbunden"
          : worker.seen
            ? `nicht erreichbar (zuletzt ${new Date(worker.seen).toLocaleString("de-DE")})`
            : "hat sich noch nie gemeldet"}
        {!worker.online && worker.seen ? ` · vor ${Math.round((now - worker.seen) / 60000)} min` : ""}
      </p>
      {token ? (
        <p className="mt-2">
          Neuer Schlüssel (wird nur jetzt angezeigt):{" "}
          <code className="select-all break-all rounded bg-zinc-950 px-1 text-orange-300">{token}</code>
          <br />
          <span className="text-xs text-zinc-500">
            Auf dem Unraid in <code>car_Liveries/tools/cls_worker.json</code> als <code>&quot;token&quot;</code> eintragen.
          </span>
        </p>
      ) : (
        <button className={`${btn} mt-2`} onClick={onToken}>
          {worker.hasToken ? "Neuen Schlüssel erzeugen (alter wird ungültig)" : "Schlüssel erzeugen"}
        </button>
      )}
    </section>
  );
}
