#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# Pass --confirm to actually delete; otherwise it's a dry-run.
MODE="${1:-}"

cat > /tmp/lm_delete_andre.ts <<'TS'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    const count = (r as any)?.count;
    console.log(
      `  ${label}: ${count != null ? `deleted ${count}` : "ok"}`
    );
    return r;
  } catch (e: any) {
    console.log(`  ${label}: SKIP (${(e?.message ?? "").slice(0, 140)})`);
    return null;
  }
}

async function main() {
  console.log("=== Find candidate users ===");
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
  });

  console.log(`Found ${candidates.length} match(es):`);
  for (const u of candidates) {
    console.log(
      `  - id=${u.id}  ${u.firstName ?? ""} ${u.lastName ?? ""}  email=${u.email ?? "—"}  discordId=${(u as any).discordId ?? "—"}  isAdmin=${(u as any).isAdmin ?? false}`
    );
  }

  if (candidates.length === 0) {
    console.error("No user named Andre Brechmann found. Aborting.");
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.error("Multiple matches — aborting. Run again narrowing the query (paste this output back).");
    process.exit(1);
  }

  const user = candidates[0];
  const userId = user.id;

  console.log("\n=== Related records ===");

  const regs = await prisma.registration.findMany({
    where: { userId },
    include: {
      season: { include: { league: { select: { name: true } } } },
      team: { select: { name: true } },
    },
  });
  console.log(`Registrations: ${regs.length}`);
  for (const r of regs) {
    console.log(
      `  - regId=${r.id}  ${r.season.league.name} / ${r.season.name} ${r.season.year}  team=${r.team?.name ?? "—"}`
    );
  }

  const reports = await prisma.incidentReport.findMany({
    where: { reporterUserId: userId },
    select: { id: true, status: true, submittedAt: true },
  });
  console.log(`Reports filed: ${reports.length}`);

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, provider: true },
  });
  console.log(`Accounts: ${accounts.length} (${accounts.map((a) => a.provider).join(", ") || "—"})`);

  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });
  console.log(`Sessions: ${sessions.length}`);

  // Team leadership
  const ledTeams = await safe("Probe ledTeams", async () =>
    (prisma as any).team.findMany({
      where: { leaderUserId: userId },
      select: { id: true, name: true },
    })
  );
  if (Array.isArray(ledTeams)) {
    console.log(`Teams led: ${ledTeams.length}`);
    for (const t of ledTeams) console.log(`  - ${t.id}  ${t.name}`);
  }

  if (!CONFIRM) {
    console.log("\n--- DRY RUN: nothing deleted. ---");
    console.log("Re-run with `--confirm` to perform the deletion.");
    return;
  }

  console.log("\n=== DELETING ===");

  await prisma.$transaction(async (tx: any) => {
    // 1. Detach team leadership (don't delete the team — just clear the FK)
    await safe("Team.leaderUserId -> null", async () =>
      tx.team.updateMany({
        where: { leaderUserId: userId },
        data: { leaderUserId: null },
      })
    );

    const regIds = regs.map((r) => r.id);

    // 2. Delete things tied to this user's registrations
    if (regIds.length > 0) {
      await safe("involvedDrivers (registration)", async () =>
        tx.incidentReportDriver.deleteMany({
          where: { registrationId: { in: regIds } },
        })
      );
      await safe("incidentReportInvolvement (registration)", async () =>
        tx.incidentReportInvolvement.deleteMany({
          where: { registrationId: { in: regIds } },
        })
      );
      await safe("penalty (registration)", async () =>
        tx.penalty.deleteMany({ where: { registrationId: { in: regIds } } })
      );
      await safe("payment (registration)", async () =>
        tx.payment.deleteMany({ where: { registrationId: { in: regIds } } })
      );
      await safe("raceResult (registration)", async () =>
        tx.raceResult.deleteMany({
          where: { registrationId: { in: regIds } },
        })
      );
    }

    // 3. Delete things tied to reports this user filed
    const reportIds = reports.map((r) => r.id);
    if (reportIds.length > 0) {
      await safe("involvedDrivers (by reportId)", async () =>
        tx.incidentReportDriver.deleteMany({
          where: { reportId: { in: reportIds } },
        })
      );
      await safe("involvement (by reportId)", async () =>
        tx.incidentReportInvolvement.deleteMany({
          where: { reportId: { in: reportIds } },
        })
      );
      await safe("decision (by reportId)", async () =>
        tx.decision.deleteMany({ where: { reportId: { in: reportIds } } })
      );
      await safe("penalty (by reportId)", async () =>
        tx.penalty.deleteMany({ where: { reportId: { in: reportIds } } })
      );
    }
    await safe("incidentReport (reporterUserId)", async () =>
      tx.incidentReport.deleteMany({ where: { reporterUserId: userId } })
    );

    // 4. Registrations
    await safe("registration (userId)", async () =>
      tx.registration.deleteMany({ where: { userId } })
    );

    // 5. NextAuth
    await safe("session", async () =>
      tx.session.deleteMany({ where: { userId } })
    );
    await safe("account", async () =>
      tx.account.deleteMany({ where: { userId } })
    );

    // 6. Finally the user
    await tx.user.delete({ where: { id: userId } });
    console.log("  user: DELETED");
  });

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
TS

if [ "$MODE" = "--confirm" ]; then
  npx --yes tsx /tmp/lm_delete_andre.ts --confirm
else
  npx --yes tsx /tmp/lm_delete_andre.ts
fi
