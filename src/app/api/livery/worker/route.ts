/**
 * Livery build worker on the Unraid (car_Liveries/tools/cls_worker.py).
 *
 *   GET  /api/livery/worker   heartbeat; → {design | null, job | null}
 *                             a queued job is handed out once (state → running)
 *   POST /api/livery/worker   JSON, one of:
 *        {seed: {design, cars, hilfe, drive}}      first contact: the Unraid's design
 *        {cars: {cars, hilfe, drive}}              car list / previews after a build
 *        {job: {id, state, log}}                   progress / result of the job
 *
 * Auth: `Authorization: Bearer <worker token>` (made on /admin/lackierungen).
 */
import { NextRequest, NextResponse } from "next/server";
import { K, getJson, setJson, workerTokenOk, type Design, type Job, type CarsInfo } from "@/lib/livery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 512 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  if (!(await workerTokenOk(req.headers.get("authorization")))) return json({ ok: false, error: "token" }, 401);
  await setJson(K.worker, { seen: Date.now(), version: req.nextUrl.searchParams.get("v") ?? undefined });
  const design = await getJson<Design>(K.design);
  let job = await getJson<Job>(K.job);
  if (job?.state === "queued") {
    job = { ...job, state: "running", started: Date.now(), log: ["Bau-Server hat den Auftrag übernommen"] };
    await setJson(K.job, job);
  } else {
    job = null; // only a freshly taken job goes out
  }
  return json({ ok: true, design, job });
}

export async function POST(req: NextRequest) {
  if (!(await workerTokenOk(req.headers.get("authorization")))) return json({ ok: false, error: "token" }, 401);
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ ok: false, error: "Body too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Body is not JSON" }, 400);
  }
  await setJson(K.worker, { seen: Date.now() });

  if (body.seed && typeof body.seed === "object") {
    const s = body.seed as { design: Design } & CarsInfo;
    if (!(await getJson<Design>(K.design))) await setJson(K.design, s.design); // never overwrite CLS edits
    await setJson(K.cars, { cars: s.cars ?? [], hilfe: s.hilfe ?? {}, drive: s.drive });
  }
  if (body.cars && typeof body.cars === "object") {
    await setJson(K.cars, body.cars);
  }
  if (body.job && typeof body.job === "object") {
    const u = body.job as Partial<Job>;
    const job = await getJson<Job>(K.job);
    if (!job || job.id !== u.id) return json({ ok: false, error: "unknown job" }, 409);
    const state = u.state === "done" || u.state === "error" ? u.state : "running";
    await setJson(K.job, {
      ...job,
      state,
      log: Array.isArray(u.log) ? u.log.slice(-200).map(String) : job.log,
      ended: state === "running" ? undefined : Date.now(),
    });
  }
  return json({ ok: true });
}
