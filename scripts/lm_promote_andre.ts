import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

const REAL_USER_ID = "cmozqutkl0000ju04x5k08cxb";        // Discord-linked, role=DRIVER
const PLACEHOLDER_USER_ID = "cmomt0gtx007z30dozc96d367"; // No accounts, role=ADMIN

async function main() {
  console.log("=== Before ===");
  const before = await prisma.user.findMany({
    where: { id: { in: [REAL_USER_ID, PLACEHOLDER_USER_ID] } },
    include: { accounts: { select: { provider: true } } },
  });
  for (const u of before) {
    console.log(
      `  ${u.id}  role=${(u as any).role}  name="${u.name ?? ""}"  fn="${u.firstName ?? ""}"  ln="${u.lastName ?? ""}"  email=${u.email ?? "—"}  accounts=${u.accounts.map((a) => a.provider).join(",") || "—"}`
    );
  }

  // Sanity check: the real user must still exist + have a Discord account
  const real = before.find((u) => u.id === REAL_USER_ID);
  if (!real) {
    console.error(`!!! Real user ${REAL_USER_ID} not found. Aborting.`);
    process.exit(1);
  }
  if (!real.accounts.some((a) => a.provider === "discord")) {
    console.error(`!!! Real user has no Discord account linked. Aborting.`);
    process.exit(1);
  }

  if (!CONFIRM) {
    console.log("\n--- DRY RUN: nothing written. ---");
    console.log("Re-run with `--confirm` to apply.");
    return;
  }

  console.log("\n=== Applying changes ===");

  await prisma.$transaction(async (tx) => {
    // 1. Promote the Discord-linked record + fill firstName/lastName
    const updated = await tx.user.update({
      where: { id: REAL_USER_ID },
      data: {
        role: "ADMIN",
        firstName: real.firstName ?? "André",
        lastName: real.lastName ?? "Brechmann",
      } as any,
    });
    console.log(`  Promoted ${updated.id} -> role=ADMIN, firstName/lastName backfilled.`);

    // 2. Delete the placeholder admin (no accounts, no real data tied to it)
    //    Defensive: only delete if no accounts/sessions/registrations.
    const placeholder = await tx.user.findUnique({
      where: { id: PLACEHOLDER_USER_ID },
      include: {
        accounts: { select: { id: true } },
        sessions: { select: { id: true } },
        registrations: { select: { id: true } },
      },
    });
    if (!placeholder) {
      console.log("  Placeholder already gone — skip.");
    } else if (
      placeholder.accounts.length > 0 ||
      placeholder.sessions.length > 0 ||
      placeholder.registrations.length > 0
    ) {
      console.log(
        `  Placeholder ${PLACEHOLDER_USER_ID} still has data (accounts=${placeholder.accounts.length} sessions=${placeholder.sessions.length} regs=${placeholder.registrations.length}) — NOT deleting.`
      );
    } else {
      await tx.user.delete({ where: { id: PLACEHOLDER_USER_ID } });
      console.log(`  Deleted placeholder ${PLACEHOLDER_USER_ID}.`);
    }
  });

  console.log("\n=== After ===");
  const after = await prisma.user.findMany({
    where: { id: { in: [REAL_USER_ID, PLACEHOLDER_USER_ID] } },
  });
  for (const u of after) {
    console.log(
      `  ${u.id}  role=${(u as any).role}  fn="${u.firstName ?? ""}"  ln="${u.lastName ?? ""}"  email=${u.email ?? "—"}`
    );
  }

  console.log("\nDone. Andre needs to sign out and back in for the new role to load into his session.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
