#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f .env ]; then set -a; source .env; set +a; fi

mkdir -p scripts
cat > scripts/find-baier.ts <<'EOF'
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
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  const season = await prisma.season.findFirst({
    where: { leagueId: league!.id, year: 2026 },
    select: { id: true, irlmLeagueName: true },
  });
  if (!season || !season.irlmLeagueName) {
    console.log("season / irlmLeagueName missing");
    return;
  }

  const token = await login();

  // 1) iRLM Members search for Baier
  const r = await fetch(`${BASE}/${season.irlmLeagueName}/Members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const members = (await r.json()) as Array<{
    memberId: number;
    iRacingId: string;
    firstname: string;
    lastname: string;
  }>;
  const baiers = members.filter((m) =>
    m.lastname.toLowerCase().includes("baier")
  );
  console.log("iRLM members with 'baier' in last name:");
  for (const m of baiers) console.log(" ", m);

  // 2) Find a round with results to check if Baier raced
  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id, irlmEventId: { not: null } },
    orderBy: { roundNumber: "asc" },
  });
  console.log("\nChecking each round for Baier's iRLM rows:");
  for (const round of rounds) {
    const evRes = await fetch(
      `${BASE}/${season.irlmLeagueName}/Events/${round.irlmEventId}/Results`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!evRes.ok) continue;
    const events = (await evRes.json()) as unknown;
    const arr = Array.isArray(events) ? events : [events];
    const ev0 = arr[0] as Record<string, unknown>;
    const sessions = (ev0.sessionResults as unknown[]) ?? [];
    for (const sess of sessions) {
      const ss = sess as Record<string, unknown>;
      const name = String(ss.sessionName ?? "?");
      const rows = (ss.resultRows as Record<string, unknown>[]) ?? [];
      const z = rows.find(
        (row) => String(row.lastname ?? "").toLowerCase().includes("baier")
      );
      if (z) {
        console.log(
          `  R${round.roundNumber} ${name}: pos=${z.finishPosition} memberId=${z.memberId} status=${z.status} racePoints=${z.racePoints}`
        );
      }
    }
  }

  // 3) Existing User in our DB for any Baier
  const dbBaiers = await prisma.user.findMany({
    where: { lastName: { contains: "Baier", mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, iracingMemberId: true },
  });
  console.log("\nUsers in our DB with 'Baier' in last name:");
  for (const u of dbBaiers) console.log(" ", u);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/find-baier.ts
