#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f .env ]; then set -a; source .env; set +a; fi

mkdir -p scripts
cat > scripts/check-wlach-sfl.ts <<'EOF'
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
  // 1. Our DB side
  const wlachUsers = await prisma.user.findMany({
    where: { lastName: { contains: "Wlach", mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, iracingMemberId: true },
  });
  console.log("Users named Wlach in our DB:");
  for (const u of wlachUsers) console.log(" ", u);

  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  const season = await prisma.season.findFirst({
    where: { leagueId: league!.id, year: 2026 },
    select: { id: true, irlmLeagueName: true },
  });
  if (!season) { console.log("season not found"); return; }
  console.log("\nSFL S7 season id:", season.id, "irlmLeagueName=" + season.irlmLeagueName);

  for (const u of wlachUsers) {
    const reg = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: u.id } },
      include: { raceResults: { select: { roundId: true, raceNumber: true, finishPosition: true, rawPointsAwarded: true } } },
    });
    if (!reg) continue;
    console.log(`\nRegistration in SFL: status=${reg.status} startNumber=${reg.startNumber}`);
    console.log(`  raceResults: ${reg.raceResults.length}`);
    for (const r of reg.raceResults) {
      console.log(`    round=${r.roundId} race=${r.raceNumber} pos=${r.finishPosition} pts=${r.rawPointsAwarded}`);
    }
  }

  // 2. iRLM side
  if (!season.irlmLeagueName) { console.log("\nNo iRLM league name on season"); return; }
  const token = await login();
  const r = await fetch(`${BASE}/${season.irlmLeagueName}/Members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) { console.log("members fetch failed:", r.status); return; }
  const members = (await r.json()) as Array<{
    memberId: number;
    iRacingId: string;
    firstname: string;
    lastname: string;
  }>;
  console.log("\niRLM members named Wlach:");
  for (const m of members.filter((m) => m.lastname.toLowerCase().includes("wlach"))) {
    console.log(" ", m);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/check-wlach-sfl.ts
