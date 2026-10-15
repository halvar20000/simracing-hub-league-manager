/**
 * Public read-only feed of live pit-stop tire data for the OBS overlays.
 *
 * Filled by the drivers' Race Loggers (POST /api/race-log/live); read by the
 * broadcast PC, which polls every few seconds during a race.
 *
 * Query params:
 *   - subsession (optional) — iRacing SubSessionID of the hosted race; the
 *                             overlay passes the one it sees so other races
 *                             running at the same time never mix in
 *   - after      (optional) — only stops with an id above this (polling)
 *   - hours      (optional) — how far back, default 6, max 6
 *
 * Unauthenticated and CORS-open like the other overlay endpoints. Never cached:
 * the point is to show a stop seconds after it happened.
 */
import { NextRequest, NextResponse } from "next/server";
import { listLivePits, LIVE_PIT_KEEP_MS } from "@/lib/live-pit-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

function intParam(v: string | null): number | null {
  if (v == null || !/^\d{1,12}$/.test(v)) return null;
  return Number(v);
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const hours = intParam(sp.get("hours"));
  const maxAgeMs = hours ? Math.min(hours * 3600_000, LIVE_PIT_KEEP_MS) : LIVE_PIT_KEEP_MS;
  const stops = listLivePits({
    subsessionId: intParam(sp.get("subsession")),
    afterId: intParam(sp.get("after")) ?? undefined,
    maxAgeMs,
  }).map(({ userId: _userId, ...rest }) => rest);   // internal id stays private
  return NextResponse.json({ now: new Date().toISOString(), stops }, { headers: HEADERS });
}
