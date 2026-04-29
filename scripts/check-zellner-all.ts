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
  const season = await prisma.season.findFirst({
    where: { leagueId: league!.id, year: 2026 },
  });
  const spa = await prisma.round.findFirst({
    where: {
      seasonId: season!.id,
      OR: [
        { name: { contains: "Spa", mode: "insensitive" } },
        { track: { contains: "Spa", mode: "insensitive" } },
      ],
    },
  });
  const token = await login();
  const url = `${BASE}/${season!.irlmLeagueName}/Events/${spa!.irlmEventId}/Results`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const events = (await r.json()) as unknown;
  const arr = Array.isArray(events) ? events : [events];

  for (let i = 0; i < arr.length; i++) {
    const ev = arr[i] as Record<string, unknown>;
    const display = String(ev.displayName ?? ev.eventName ?? "?");
    console.log(`\n=== EventResult[${i}] ${display} ===`);
    const sessions = (ev.sessionResults as unknown[]) ?? [];
    for (const s of sessions) {
      const ss = s as Record<string, unknown>;
      const name = String(ss.sessionName ?? "?");
      const rows = (ss.resultRows as Record<string, unknown>[]) ?? [];
      const z = rows.find(
        (row) => String(row.lastname ?? "").toLowerCase() === "zellner"
      );
      if (!z) continue;
      console.log(`  -- ${name} (rows: ${rows.length}) --`);
      console.log("    " +
        JSON.stringify({
          finishPosition: z.finishPosition,
          finalPosition: z.finalPosition,
          racePoints: z.racePoints,
          bonusPoints: z.bonusPoints,
          penaltyPoints: z.penaltyPoints,
          totalPoints: z.totalPoints,
          status: z.status,
        })
      );
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
