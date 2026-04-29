import { prisma } from "@/lib/prisma";

const BASE = "https://irleaguemanager.net/api";
const USERNAME = process.env.IRLM_USERNAME!;
const PASSWORD = process.env.IRLM_PASSWORD!;

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const j = (await r.json()) as Record<string, unknown>;
  return (j.token as string) || (j.accessToken as string) || (j.jwt as string) || (j.idToken as string);
}

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) throw new Error("league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season || !season.irlmLeagueName) throw new Error("season/irlmLeagueName missing");
  const spa = await prisma.round.findFirst({
    where: {
      seasonId: season.id,
      OR: [
        { name: { contains: "Spa", mode: "insensitive" } },
        { track: { contains: "Spa", mode: "insensitive" } },
      ],
    },
  });
  if (!spa || !spa.irlmEventId) throw new Error("Spa round / irlmEventId missing");

  const token = await login();
  const url = `${BASE}/${season.irlmLeagueName}/Events/${spa.irlmEventId}/Results`;
  console.log("GET", url);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { console.log("status:", r.status, await r.text()); return; }
  const events = (await r.json()) as unknown;
  const arr = Array.isArray(events) ? events : [events];
  const ev0 = arr[0] as Record<string, unknown>;
  const sessions = (ev0.sessionResults as unknown[]) ?? [];

  for (const s of sessions) {
    const ss = s as Record<string, unknown>;
    const name = String(ss.sessionName ?? ss.sessionType ?? "");
    const rows = (ss.resultRows as Record<string, unknown>[]) ?? [];
    const z = rows.find((row) => String(row.lastname).toLowerCase() === "zellner");
    if (!z) continue;
    console.log("\n--- Session:", name, "(rows:", rows.length + ") ---");
    console.log({
      firstname: z.firstname,
      lastname: z.lastname,
      memberId: z.memberId,
      startPosition: z.startPosition,
      finishPosition: z.finishPosition,
      finalPosition: z.finalPosition,
      finalPositionChange: z.finalPositionChange,
      completedLaps: z.completedLaps,
      completedPct: z.completedPct,
      status: z.status,
      racePoints: z.racePoints,
      bonusPoints: z.bonusPoints,
      penaltyPoints: z.penaltyPoints,
      totalPoints: z.totalPoints,
      penaltyPositions: z.penaltyPositions,
      penaltyTime: z.penaltyTime,
    });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
