/**
 * Live pit stops from the standalone iRacing Race Logger.
 *
 * The logger on the driver's PC POSTs ONE pit event (with the tread readings
 * iRacing only shows the driver himself) the moment the car leaves the pit
 * lane, so the stream can show the tires while the race is still running. The
 * full log still arrives afterwards through POST /api/race-log.
 *
 *   POST /api/race-log/live   → JSON {v, session, driver, event}
 *
 * Auth: the same personal logger token (`Authorization: Bearer <token>`).
 * Stored in memory only — see src/lib/live-pit-store.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tokenFromRequest, userByRaceLoggerToken, displayName } from "@/lib/race-logger";
import { addLivePit, parseLivePit } from "@/lib/live-pit-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 32 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  const user = await userByRaceLoggerToken(tokenFromRequest(req));
  if (!user) return json({ ok: false, error: "Invalid or unknown logger token" }, 401);

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ ok: false, error: "Body too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Body is not JSON" }, 400);
  }

  const parsed = parseLivePit(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 422);

  const extra = await prisma.user.findUnique({
    where: { id: user.id },
    select: { iracingMemberId: true },
  });
  const added = addLivePit(
    { userId: user.id, driver: displayName(user), iracingMemberId: extra?.iracingMemberId ?? null },
    parsed.stop
  );
  if (!added.ok) return json({ ok: false, error: added.error }, 429);
  return json({ ok: true, id: added.row.id });
}
