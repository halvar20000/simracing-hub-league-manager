/**
 * Livery worker uploads an image (a car preview or a logo of the library):
 *   POST /api/livery/worker/file?kind=preview&name=<car key>   body = PNG / JPEG
 *   POST /api/livery/worker/file?kind=logo&name=<logo name>    body = PNG
 * → {url} (Vercel Blob, public). Auth as /api/livery/worker.
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { workerTokenOk } from "@/lib/livery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await workerTokenOk(req.headers.get("authorization"))))
    return NextResponse.json({ ok: false, error: "token" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind");
  const name = (req.nextUrl.searchParams.get("name") ?? "").replace(/[^\w.-]+/g, "_").slice(0, 60);
  if ((kind !== "preview" && kind !== "logo") || !name)
    return NextResponse.json({ ok: false, error: "kind / name" }, { status: 400 });
  const type = req.headers.get("content-type") ?? "image/png";
  if (!/^image\/(png|jpeg)$/.test(type)) return NextResponse.json({ ok: false, error: "type" }, { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES)
    return NextResponse.json({ ok: false, error: "size" }, { status: 413 });
  const ext = type === "image/jpeg" ? "jpg" : "png";
  const blob = await put(`livery/${kind}/${name}.${Date.now()}.${ext}`, buf, {
    access: "public",
    contentType: type,
    addRandomSuffix: false,
  });
  return NextResponse.json({ ok: true, url: blob.url });
}
