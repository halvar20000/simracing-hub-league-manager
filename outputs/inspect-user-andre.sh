#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/lm_inspect_andre.ts <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        {
          AND: [
            { firstName: { contains: "Andre", mode: "insensitive" } },
            { lastName: { contains: "Brechmann", mode: "insensitive" } },
          ],
        },
        { name: { contains: "Brechmann", mode: "insensitive" } },
        { email: { contains: "brechmann", mode: "insensitive" } },
      ],
    },
    include: {
      accounts: {
        select: {
          id: true,
          provider: true,
          providerAccountId: true,
        },
      },
      sessions: { select: { id: true, expires: true } },
    },
  });

  console.log(`Matches: ${candidates.length}\n`);

  for (const u of candidates) {
    const adminFlag = (u as any).isAdmin;
    const stewardFlag = (u as any).isSteward;
    const role = (u as any).role;

    console.log(`--- userId=${u.id} ---`);
    console.log(`  name:          ${u.firstName ?? ""} ${u.lastName ?? ""}  (display: ${u.name ?? "—"})`);
    console.log(`  email:         ${u.email ?? "—"}`);
    console.log(`  emailVerified: ${u.emailVerified ?? "—"}`);
    console.log(`  isAdmin:       ${adminFlag ?? "(field not set)"}`);
    console.log(`  isSteward:     ${stewardFlag ?? "(field not set)"}`);
    console.log(`  role:          ${role ?? "(field not set)"}`);
    console.log(`  createdAt:     ${(u as any).createdAt ?? "—"}`);
    console.log(`  Accounts: ${u.accounts.length}`);
    for (const a of u.accounts) {
      console.log(`    - provider=${a.provider}  providerAccountId=${a.providerAccountId}`);
    }
    console.log(`  Sessions:  ${u.sessions.length}`);
    console.log("");
  }

  // Probe other role tables that might exist
  console.log("=== Role/membership tables (best-effort probes) ===");
  const userIds = candidates.map((c) => c.id);
  const probes: Array<[string, () => Promise<any>]> = [
    ["leagueMember", () => (prisma as any).leagueMember.findMany({ where: { userId: { in: userIds } } })],
    ["leagueRole", () => (prisma as any).leagueRole.findMany({ where: { userId: { in: userIds } } })],
    ["userRole", () => (prisma as any).userRole.findMany({ where: { userId: { in: userIds } } })],
    ["seasonSteward", () => (prisma as any).seasonSteward.findMany({ where: { userId: { in: userIds } } })],
    ["steward", () => (prisma as any).steward.findMany({ where: { userId: { in: userIds } } })],
  ];
  for (const [label, fn] of probes) {
    try {
      const rows = await fn();
      console.log(`  ${label}: ${rows.length} row(s)${rows.length ? " " + JSON.stringify(rows) : ""}`);
    } catch {
      // model not in schema — skip silently
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
TS

npx --yes tsx scripts/lm_inspect_andre.ts
