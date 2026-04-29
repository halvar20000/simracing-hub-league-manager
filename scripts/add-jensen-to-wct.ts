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
  // 1) Find the WCT12 season + irlm league name
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) throw new Error("cas-gt3-wct not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) throw new Error("WCT season not found");
  console.log("Season:", season.name, "irlmLeagueName=" + season.irlmLeagueName);
  if (!season.irlmLeagueName) {
    console.error("Season has no irlmLeagueName set — please configure that first.");
    process.exit(1);
  }

  // 2) Fetch iRLM members and find Justin Jensen
  const token = await login();
  const r = await fetch(`${BASE}/${season.irlmLeagueName}/Members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    console.error("Failed to fetch members:", r.status);
    process.exit(1);
  }
  const members = (await r.json()) as Array<{
    memberId: number;
    iRacingId: string;
    firstname: string;
    lastname: string;
  }>;
  const jensen = members.find(
    (m) =>
      m.lastname.toLowerCase().includes("jensen") &&
      (m.firstname.toLowerCase().includes("justin") || m.firstname === "")
  );
  if (!jensen) {
    console.log("Justin Jensen not found in iRLM members. Candidates with 'jensen' in last name:");
    for (const m of members.filter((m) => m.lastname.toLowerCase().includes("jensen"))) {
      console.log(" ", m.firstname, m.lastname, "iRacingId=" + m.iRacingId);
    }
    process.exit(1);
  }
  console.log(
    "Found in iRLM:",
    jensen.firstname,
    jensen.lastname,
    "iRacingId=" + jensen.iRacingId
  );

  // 3) Find or create User
  let user = await prisma.user.findUnique({
    where: { iracingMemberId: jensen.iRacingId },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        iracingMemberId: jensen.iRacingId,
        firstName: jensen.firstname,
        lastName: jensen.lastname,
        name: `${jensen.firstname} ${jensen.lastname}`,
        role: "DRIVER",
      },
    });
    console.log("Created User:", user.id);
  } else {
    console.log("User already exists:", user.id);
  }

  // 4) Find or create Registration with status=APPROVED + excludedAt set
  let reg = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
  });
  if (reg) {
    if (reg.status !== "APPROVED" || !reg.excludedAt) {
      await prisma.registration.update({
        where: { id: reg.id },
        data: {
          status: "APPROVED",
          excludedAt: reg.excludedAt ?? new Date(),
          approvedAt: reg.approvedAt ?? new Date(),
        },
      });
      console.log("Updated existing registration -> APPROVED + excluded.");
    } else {
      console.log("Registration already APPROVED + excluded.");
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

  // 5) Print which rounds still need re-pulling
  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id, irlmEventId: { not: null } },
    orderBy: { roundNumber: "asc" },
    select: { id: true, roundNumber: true, name: true, irlmEventId: true },
  });
  console.log("\nRounds with iRLM data — RE-PULL each in admin to import Jensen's historical results:");
  for (const r of rounds) {
    console.log(`  R${r.roundNumber} ${r.name}  irlmEventId=${r.irlmEventId}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
