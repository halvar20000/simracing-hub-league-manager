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
  if (!r.ok) throw new Error("login failed: " + r.status);
  const j = (await r.json()) as Record<string, unknown>;
  return (j.token as string) || (j.accessToken as string) || (j.jwt as string) || (j.idToken as string);
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.error("Set IRLM_USERNAME and IRLM_PASSWORD in .env");
    process.exit(1);
  }

  // Find the SFL season we created and one round with an irlmEventId
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  if (!league) throw new Error("cas-sfl-cup not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
    include: {
      rounds: {
        where: { irlmEventId: { not: null } },
        orderBy: { roundNumber: "asc" },
      },
    },
  });
  if (!season) throw new Error("SFL season not found");
  console.log("Season:", season.id, season.name, "irlmLeagueName=" + season.irlmLeagueName);
  console.log("Rounds with irlmEventId:");
  for (const r of season.rounds) {
    console.log("  R" + r.roundNumber, r.name, "irlmEventId=" + r.irlmEventId);
  }
  if (!season.irlmLeagueName) {
    console.log("(no irlmLeagueName set on the season — set it on the season edit page first)");
    process.exit(0);
  }
  const sample = season.rounds[0];
  if (!sample) {
    console.log("(no rounds have an irlmEventId — set one on a round edit page first)");
    process.exit(0);
  }

  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };

  const url = `${BASE}/${season.irlmLeagueName}/Events/${sample.irlmEventId}/Results`;
  console.log("\nGET", url);
  const r = await fetch(url, { headers: auth });
  console.log("status:", r.status);
  if (!r.ok) {
    console.log(await r.text());
    return;
  }
  const j = (await r.json()) as unknown;
  const events = Array.isArray(j) ? j : [j];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i] as Record<string, unknown>;
    console.log(`\n--- EventResult[${i}] ---`);
    console.log("displayName=" + String(ev.displayName));
    console.log("name=" + String(ev.eventName));
    const sessions = (ev.sessionResults as unknown[]) ?? [];
    console.log(`sessions: ${sessions.length}`);
    for (let k = 0; k < sessions.length; k++) {
      const ss = sessions[k] as Record<string, unknown>;
      const rows = (ss.resultRows as unknown[]) ?? [];
      const sample = rows[0] as Record<string, unknown> | undefined;
      console.log(
        `  [${k}] sessionType=${String(ss.sessionType)} sessionName=${String(ss.sessionName)} ` +
        `classId=${String(ss.classId ?? "-")} rows=${rows.length} ` +
        (sample
          ? `firstRow={finishPosition=${sample.finishPosition}, finalPosition=${sample.finalPosition}, ` +
            `racePoints=${sample.racePoints}, totalPoints=${sample.totalPoints}, memberId=${sample.memberId}, lastName=${sample.lastname}}`
          : "")
      );
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
