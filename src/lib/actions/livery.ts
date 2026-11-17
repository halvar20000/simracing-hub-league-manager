"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  K,
  checkDesign,
  getJson,
  jobBusy,
  newWorkerToken,
  setJson,
  type CarsInfo,
  type Design,
  type Job,
} from "@/lib/livery";

type Res = { ok: boolean; error?: string };

/** Save the edited design (colours, colour roles, logo roles). */
export async function saveLiveryDesign(d: Design): Promise<Res> {
  await requireAdmin();
  const old = await getJson<Design>(K.design);
  if (!old) return { ok: false, error: "Noch kein Design vom Bau-Server da" };
  const r = checkDesign(d, old);
  if (!r.design) return { ok: false, error: r.error };
  await setJson(K.design, r.design);
  revalidatePath("/admin/lackierungen");
  return { ok: true };
}

/** Save + queue a build of the given cars (the Unraid worker picks it up). */
export async function startLiveryBuild(d: Design, cars: string[]): Promise<Res> {
  const me = await requireAdmin();
  const saved = await saveLiveryDesign(d);
  if (!saved.ok) return saved;
  const info = await getJson<CarsInfo>(K.cars);
  const valid = new Set((info?.cars ?? []).map((c) => c.key));
  const keys = cars.filter((k) => valid.has(k));
  if (!keys.length) return { ok: false, error: "Kein Auto angehakt" };
  if (jobBusy(await getJson<Job>(K.job))) return { ok: false, error: "Es läuft schon ein Bau" };
  const design = (await getJson<Design>(K.design))!;
  const job: Job = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    cars: keys,
    design,
    state: "queued",
    log: ["Wartet auf den Bau-Server …"],
    by: [me.firstName, me.lastName].filter(Boolean).join(" ") || me.name || "Admin",
    created: Date.now(),
  };
  await setJson(K.job, job);
  revalidatePath("/admin/lackierungen");
  return { ok: true };
}

/** Upload a new logo (PNG with transparency) into the library. */
export async function uploadLiveryLogo(form: FormData): Promise<Res> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const file = form.get("file");
  if (!/^[\w äöüÄÖÜß.+&()-]{1,40}$/.test(name)) return { ok: false, error: "Name ungültig (max. 40 Zeichen)" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "PNG-Datei wählen" };
  if (file.type !== "image/png") return { ok: false, error: "Nur PNG (mit Transparenz)" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Höchstens 5 MB" };
  const design = await getJson<Design>(K.design);
  if (!design) return { ok: false, error: "Noch kein Design vom Bau-Server da" };
  if (name in design.logos) return { ok: false, error: "Ein Logo mit diesem Namen gibt es schon" };
  const safe = name.replace(/[^\w.-]+/g, "_");
  const blob = await put(`livery/logo/${safe}.${Date.now()}.png`, file, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });
  await setJson(K.design, { ...design, logos: { ...design.logos, [name]: blob.url } });
  revalidatePath("/admin/lackierungen");
  return { ok: true };
}

/** New token for the Unraid worker (old one stops working). Shown once. */
export async function makeLiveryWorkerToken(): Promise<{ ok: boolean; token?: string }> {
  await requireAdmin();
  return { ok: true, token: await newWorkerToken() };
}
