import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

const SURVIVOR_ID = "cmozqutkl0000ju04x5k08cxb"; // Discord-linked, has email
const DUPE_ID     = "cmomt0gtx007z30dozc96d367"; // has iRacing 781575, has IEC reg

async function showState(label: string) {
  const users = await prisma.user.findMany({
    where: { id: { in: [SURVIVOR_ID, DUPE_ID] } },
    include: {
      accounts: { select: { provider: true } },
      sessions: { select: { id: true } },
    },
  });
  console.log(`\n=== ${label} ===`);
  for (const u of users) {
    const regs = await prisma.registration.count({ where: { userId: u.id } });
    console.log(
      `  ${u.id}  fn=${u.firstName ?? "—"}  ln=${u.lastName ?? "—"}  name="${u.name ?? ""}"  email=${u.email ?? "—"}  iRacing=${(u as any).iracingMemberId ?? "—"}  accounts=${u.accounts.map((a) => a.provider).join(",") || "—"}  sessions=${u.sessions.length}  regs=${regs}`
    );
  }
}

async function safe(label: string, fn: () => Promise<any>) {
  try {
    const r = await fn();
    const count = (r as any)?.count;
    console.log(`  ${label}: ${count != null ? `moved ${count}` : "ok"}`);
  } catch (e: any) {
    console.log(`  ${label}: SKIP (${String(e?.message ?? "").slice(0, 140)})`);
  }
}

async function main() {
  await showState("Before");

  // Sanity checks
  const survivor = await prisma.user.findUnique({
    where: { id: SURVIVOR_ID },
    include: { accounts: { select: { provider: true } } },
  });
  const dupe = await prisma.user.findUnique({ where: { id: DUPE_ID } });
  if (!survivor || !dupe) {
    console.error("\n!!! Survivor or duplicate not found. Aborting.");
    process.exit(1);
  }
  if (!survivor.accounts.some((a) => a.provider === "discord")) {
    console.error("\n!!! Survivor has no Discord account linked. Aborting (would break login).");
    process.exit(1);
  }
  if ((dupe as any).iracingMemberId !== "781575") {
    console.error(`\n!!! Dupe iracingMemberId is "${(dupe as any).iracingMemberId}", expected "781575". Aborting.`);
    process.exit(1);
  }

  if (!CONFIRM) {
    console.log("\n--- DRY RUN ---");
    console.log("Re-run with `--confirm` to perform the merge.");
    return;
  }

  console.log("\n=== Merging ===");

  await prisma.$transaction(async (tx: any) => {
    // 1. Free the iRacing unique key on the dupe
    await tx.user.update({
      where: { id: DUPE_ID },
      data: { iracingMemberId: null },
    });
    console.log("  Dupe iracingMemberId cleared.");

    // 2. Update survivor: name fields + iRacing
    await tx.user.update({
      where: { id: SURVIVOR_ID },
      data: {
        firstName: "Andre",
        lastName: "Brechmann",
        name: "Andre Brechmann",
        iracingMemberId: "781575",
      },
    });
    console.log("  Survivor updated: firstName=Andre, lastName=Brechmann, name=Andre Brechmann, iracingMemberId=781575.");

    // 3. Move child records
    await safe("Registration.userId", () =>
      tx.registration.updateMany({
        where: { userId: DUPE_ID },
        data: { userId: SURVIVOR_ID },
      })
    );
    await safe("Account.userId", () =>
      tx.account.updateMany({
        where: { userId: DUPE_ID },
        data: { userId: SURVIVOR_ID },
      })
    );
    await safe("Session.userId", () =>
      tx.session.updateMany({
        where: { userId: DUPE_ID },
        data: { userId: SURVIVOR_ID },
      })
    );
    await safe("IncidentReport.reporterUserId", () =>
      tx.incidentReport.updateMany({
        where: { reporterUserId: DUPE_ID },
        data: { reporterUserId: SURVIVOR_ID },
      })
    );
    await safe("IncidentDecision.decidedByUserId", () =>
      tx.incidentDecision.updateMany({
        where: { decidedByUserId: DUPE_ID },
        data: { decidedByUserId: SURVIVOR_ID },
      })
    );
    await safe("IncidentReportComment.authorUserId", () =>
      tx.incidentReportComment.updateMany({
        where: { authorUserId: DUPE_ID },
        data: { authorUserId: SURVIVOR_ID },
      })
    );
    await safe("IncidentReportEvidence.addedByUserId", () =>
      tx.incidentReportEvidence.updateMany({
        where: { addedByUserId: DUPE_ID },
        data: { addedByUserId: SURVIVOR_ID },
      })
    );
    await safe("League.createdById", () =>
      tx.league.updateMany({
        where: { createdById: DUPE_ID },
        data: { createdById: SURVIVOR_ID },
      })
    );
    await safe("CsvImport.uploadedById", () =>
      tx.csvImport.updateMany({
        where: { uploadedById: DUPE_ID },
        data: { uploadedById: SURVIVOR_ID },
      })
    );
    // RegistrationApprovedBy relation
    await safe("Registration.approvedById", () =>
      tx.registration.updateMany({
        where: { approvedById: DUPE_ID },
        data: { approvedById: SURVIVOR_ID },
      })
    );

    // 4. Delete dupe
    await tx.user.delete({ where: { id: DUPE_ID } });
    console.log("  Dupe user deleted.");
  });

  await showState("After");
  console.log("\nDone. Andre should refresh / sign out & back in to pick up the new name + iRacing ID in his session.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
