import { requireAdmin } from "@/lib/auth-helpers";
import { K, WORKER_ONLINE_MS, getJson, type CarsInfo, type Design, type Job, type WorkerBeat } from "@/lib/livery";
import LiveryDesigner from "@/components/LiveryDesigner";

export const dynamic = "force-dynamic";

export default async function LackierungenPage() {
  await requireAdmin();
  const [design, info, job, beat, token] = await Promise.all([
    getJson<Design>(K.design),
    getJson<CarsInfo>(K.cars),
    getJson<Job>(K.job),
    getJson<WorkerBeat>(K.worker),
    getJson<{ created: number }>(K.token),
  ]);
  const now = Date.now();
  const online = !!beat && now - beat.seen < WORKER_ONLINE_MS;
  const jobView = job ? { ...job, design: undefined } : null;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lackierungen (CTP)</h1>
        <p className="text-sm text-zinc-400">
          Farben und Logos für alle CTP-Autos. Gebaut wird auf dem Unraid-Server; die fertigen Dateien landen in
          Google Drive{info?.drive ? (
            <>
              {" "}
              (<a className="text-orange-400 underline" href={info.drive} target="_blank" rel="noreferrer">Ordner öffnen</a>)
            </>
          ) : null}
          .
        </p>
      </div>
      <LiveryDesigner
        design={design}
        cars={info?.cars ?? []}
        hilfe={info?.hilfe ?? {}}
        job={jobView}
        worker={{ online, seen: beat?.seen ?? 0, hasToken: !!token }}
        now={now}
      />
    </div>
  );
}
