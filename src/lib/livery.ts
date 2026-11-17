/**
 * CTP livery builder ("Lackierungen", /admin/lackierungen).
 *
 * The liveries are BUILT on Thomas's Unraid server (Photoshop templates,
 * Photocraft, ~1.2 GB of PSDs — car_Liveries/ in the iracing-overlays repo).
 * CLS only holds the design and a one-slot job queue; the build worker
 * (car_Liveries/tools/cls_worker.py) polls GET /api/livery/worker with its
 * token, takes a queued job, builds, uploads the previews and reports back.
 * The finished TGAs go to Google Drive (rclone on the Unraid), not to CLS.
 *
 * Everything lives in AppSetting rows (no schema change):
 *   livery:design        design.json (farben, farbrollen, logos{name: url}, logorollen, ...)
 *   livery:cars          {cars: [...], hilfe: {...}, drive: url}  sent by the worker
 *   livery:job           the current / last job
 *   livery:worker        {seen, version} heartbeat
 *   livery:worker-token  sha256 of the worker token
 *
 * Plain util — no "use server" (imported by the API route AND the actions).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const K = {
  design: "livery:design",
  cars: "livery:cars",
  job: "livery:job",
  worker: "livery:worker",
  token: "livery:worker-token",
} as const;

export type Design = {
  farben: Record<string, string>;
  farbrollen: Record<string, string>;
  logos: Record<string, string>;
  logorollen: Record<string, string>;
  [k: string]: unknown;
};
export type LiveryCar = {
  key: string;
  name: string;
  proam: boolean;
  stand: number; // unix s of the last build, 0 = never
  vorschau: string | null; // blob url of the preview
};
export type CarsInfo = { cars: LiveryCar[]; hilfe: Record<string, string>; drive?: string };
export type Job = {
  id: string;
  cars: string[];
  design: Design;
  state: "queued" | "running" | "done" | "error";
  log: string[];
  by: string;
  created: number;
  started?: number;
  ended?: number;
};
export type WorkerBeat = { seen: number; version?: string };

/** a worker not heard from for this long is "offline" (it polls every 5 s) */
export const WORKER_ONLINE_MS = 60_000;
/** a running job without progress for this long is given up */
export const JOB_STALE_MS = 20 * 60_000;

export async function getJson<T>(key: string): Promise<T | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** new worker token; only its hash is stored, the token is shown once */
export async function newWorkerToken(): Promise<string> {
  const token = "lvw_" + randomBytes(24).toString("base64url");
  await setJson(K.token, { hash: sha(token), created: Date.now() });
  return token;
}

export async function workerTokenOk(header: string | null): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m) return false;
  const row = await getJson<{ hash: string }>(K.token);
  if (!row?.hash) return false;
  const a = Buffer.from(sha(m[1]), "hex");
  const b = Buffer.from(row.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const NAME_RE = /^[\w äöüÄÖÜß.+&()-]{1,40}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Checks an edited design against the stored one (roles can only be re-assigned,
 * never invented) and returns the merged design, or an error text (German, shown
 * on the page).
 */
export function checkDesign(d: Design, old: Design): { design?: Design; error?: string } {
  for (const k of ["farben", "farbrollen", "logos", "logorollen"] as const) {
    if (!d || typeof d[k] !== "object" || d[k] === null) return { error: `${k} fehlt` };
  }
  for (const [n, h] of Object.entries(d.farben)) {
    if (!NAME_RE.test(n) || !HEX_RE.test(h)) return { error: `Farbe '${n}': Name oder Wert ungültig` };
  }
  for (const [r, n] of Object.entries(d.farbrollen)) {
    if (!(r in old.farbrollen) || !(n in d.farben)) return { error: `Farbrolle ${r}: '${n}' gibt es nicht` };
  }
  for (const [n, u] of Object.entries(d.logos)) {
    if (!NAME_RE.test(n)) return { error: `Logo '${n}': Name ungültig` };
    if (u !== old.logos[n] && !/^https:\/\//.test(u)) return { error: `Logo '${n}': Datei fehlt` };
  }
  for (const [r, n] of Object.entries(d.logorollen)) {
    if (!(r in old.logorollen) || !(n in d.logos)) return { error: `Logorolle ${r}: '${n}' gibt es nicht` };
  }
  return { design: { ...old, farben: d.farben, farbrollen: d.farbrollen, logos: d.logos, logorollen: d.logorollen } };
}

/** job that is queued / running and not given up */
export function jobBusy(job: Job | null, now = Date.now()): boolean {
  if (!job) return false;
  if (job.state === "queued") return true;
  return job.state === "running" && now - (job.started ?? job.created) < JOB_STALE_MS;
}
