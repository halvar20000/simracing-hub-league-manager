#!/usr/bin/env bash
# Find Tobias Baier in iRLM (SFL members) and add him to CAS SFL Cup S7
# as APPROVED + excludedAt set (same treatment as Kevin / Justin).
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f .env ]; then set -a; source .env; set +a; fi

mkdir -p scripts
cat > scripts/add-baier-to-sfl.ts <<'EOF'
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
  if (!league) throw new Error("league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season || !season.irlmLeagueName) throw new Error("season missing");

  const token = await login();
  const r = await fetch(`${BASE}/${season.irlmLeagueName}/Members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("members fetch failed");
  const members = (await r.json()) as Array<{
    memberId: number;
    iRacingId: string;
    firstname: string;
    lastname: string;
  }>;

  const baier = members.find(
    (m) =>
      m.lastname.toLowerCase().includes("baier") &&
      m.firstname.toLowerCase().includes("tobias")
  );
  if (!baier) {
    console.log("Tobias Baier not found in iRLM members. Candidates:");
    for (const m of members.filter((m) => m.lastname.toLowerCase().includes("baier"))) {
      console.log(" ", m);
    }
    process.exit(1);
  }
  console.log(
    "Found in iRLM:",
    baier.firstname,
    baier.lastname,
    "iRacingId=" + baier.iRacingId
  );

  // Find or create User
  let user = await prisma.user.findUnique({
    where: { iracingMemberId: baier.iRacingId },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        iracingMemberId: baier.iRacingId,
        firstName: baier.firstname,
        lastName: baier.lastname,
        name: `${baier.firstname} ${baier.lastname}`,
        role: "DRIVER",
      },
    });
    console.log("Created User:", user.id);
  } else {
    console.log("User already exists:", user.id);
  }

  // Find or create Registration: APPROVED + excludedAt
  let reg = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
  });
  if (reg) {
    if (reg.status !== "APPROVED" || !reg.excludedAt) {
      reg = await prisma.registration.update({
        where: { id: reg.id },
        data: {
          status: "APPROVED",
          excludedAt: reg.excludedAt ?? new Date(),
          approvedAt: reg.approvedAt ?? new Date(),
        },
      });
      console.log("Updated existing registration -> APPROVED + excludedAt.");
    } else {
      console.log("Registration already APPROVED + excludedAt.");
    }
  } else {
    reg = await prisma.registration.create({
      data: {
        seasonId: season.id,
        userId: user.id,
        status: "APPROVED",
        excludedAt: new Date(),
        approvedAt: new Date(),
      },
    });
    console.log("Created Registration:", reg.id);
  }

  // Print rounds with iRLM data so user knows which to re-pull
  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id, irlmEventId: { not: null } },
    orderBy: { roundNumber: "asc" },
    select: { roundNumber: true, name: true, irlmEventId: true },
  });
  console.log("\nRE-PULL each of these rounds in admin to import Baier's results:");
  for (const r of rounds) {
    console.log(`  R${r.roundNumber} ${r.name}  irlmEventId=${r.irlmEventId}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/add-baier-to-sfl.ts
