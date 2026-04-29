import { prisma } from "@/lib/prisma";

async function main() {
  const right = await prisma.user.findUnique({
    where: { iracingMemberId: "841362" },
  });
  if (!right) throw new Error("No User with iracingMemberId 841362 found");
  console.log("Correct user:", right.id, right.firstName, right.lastName);

  const wrong = await prisma.user.findUnique({
    where: { iracingMemberId: "710028" },
  });
  if (!wrong) {
    console.log("No User with iracingMemberId 710028 — nothing to merge.");
    return;
  }
  console.log("Wrong user:", wrong.id, wrong.firstName, wrong.lastName);

  if (right.id === wrong.id) {
    console.log("Already the same user; nothing to do.");
    return;
  }

  // Re-point every Registration belonging to the wrong User to the correct one.
  // Need to handle the @@unique([seasonId, userId]) — if both users had a reg
  // in the same season, that'd collide. Check first.
  const wrongRegs = await prisma.registration.findMany({
    where: { userId: wrong.id },
    select: { id: true, seasonId: true },
  });
  console.log(`Wrong user has ${wrongRegs.length} registration(s).`);

  for (const r of wrongRegs) {
    const conflict = await prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId: r.seasonId, userId: right.id } },
    });
    if (conflict) {
      console.log(
        `Skipping registration ${r.id} — correct user already has a registration in season ${r.seasonId} (id=${conflict.id}). Manual cleanup needed.`
      );
      continue;
    }
    await prisma.registration.update({
      where: { id: r.id },
      data: { userId: right.id },
    });
    console.log(`  re-pointed registration ${r.id} -> user ${right.id}`);
  }

  // Re-point any other tables that have a userId on the wrong record.
  // (Approvals, csvImports, incidentReports, etc. are not relevant for this
  // duplicate since the wrong user just registered — but be defensive.)
  const otherFields: { table: string; relation: () => Promise<unknown> }[] = [
    { table: "csvImports", relation: () => prisma.csvImport.updateMany({ where: { uploadedById: wrong.id }, data: { uploadedById: right.id } }) },
  ];
  for (const f of otherFields) {
    try {
      const res = await f.relation();
      console.log(`  re-pointed ${f.table}:`, res);
    } catch (e) {
      console.log(`  (skipping ${f.table})`);
    }
  }

  // Now delete the duplicate user.
  // Will fail if anything still references it — that's intentional, we want
  // to know.
  try {
    await prisma.user.delete({ where: { id: wrong.id } });
    console.log("Deleted duplicate User", wrong.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      "Could not delete duplicate User (likely still referenced):",
      msg.split("\n")[0]
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
