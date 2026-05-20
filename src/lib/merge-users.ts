import type { PrismaClient, Prisma } from "@prisma/client";

export type MergeResult =
  | { ok: true; survivorId: string; movedRegistrations: number }
  | { ok: false; reason: string };

/**
 * Merge a duplicate "orphan" User row into a survivor User row.
 *
 * The orphan is an account with no Discord login (no `Account` row) —
 * typically created by an admin or an import, holding the driver's iRacing
 * ID and any pre-made registrations. The survivor is the Discord-linked
 * account the driver actually signs in with. Every domain relation owned by
 * the orphan is repointed onto the survivor and the orphan row is deleted,
 * so the driver ends up with a single account that keeps working for login.
 *
 * This is a pure helper (NOT a server action) so it can be called from both
 * the profile server action and one-off scripts. See CLAUDE.md "Common
 * gotchas" for why shared logic must not live in a `"use server"` file.
 *
 * It refuses to merge when the result would not be obviously safe:
 *   - the orphan has its own Discord login — then it is not an orphan but a
 *     genuine second identity, which an admin must resolve by hand;
 *   - both rows hold a Registration in the same season — `Registration` is
 *     unique per `[seasonId, userId]`, so repointing would collide; an admin
 *     must decide which registration to keep.
 */
export async function mergeUserAccounts(
  prisma: PrismaClient,
  orphanId: string,
  survivorId: string
): Promise<MergeResult> {
  if (orphanId === survivorId) {
    return { ok: false, reason: "orphan and survivor are the same row" };
  }

  const [orphan, survivor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: orphanId },
      include: {
        _count: { select: { accounts: true } },
        registrations: { select: { seasonId: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: survivorId },
      include: { registrations: { select: { seasonId: true } } },
    }),
  ]);

  if (!orphan) return { ok: false, reason: "orphan user not found" };
  if (!survivor) return { ok: false, reason: "survivor user not found" };

  if (orphan._count.accounts > 0) {
    return {
      ok: false,
      reason:
        "the duplicate account has its own Discord login — an admin must resolve it manually",
    };
  }

  const survivorSeasons = new Set(
    survivor.registrations.map((r) => r.seasonId)
  );
  if (orphan.registrations.some((r) => survivorSeasons.has(r.seasonId))) {
    return {
      ok: false,
      reason:
        "both accounts are registered in the same season — an admin must pick which registration to keep",
    };
  }

  await prisma.$transaction(async (tx) => {
    // Free the orphan's unique fields so the survivor can claim them.
    await tx.user.update({
      where: { id: orphanId },
      data: { iracingMemberId: null, email: null },
    });

    // Repoint every User-owned relation: orphan -> survivor.
    await tx.account.updateMany({ where: { userId: orphanId }, data: { userId: survivorId } });
    await tx.session.updateMany({ where: { userId: orphanId }, data: { userId: survivorId } });
    await tx.registration.updateMany({ where: { userId: orphanId }, data: { userId: survivorId } });
    await tx.registration.updateMany({ where: { approvedById: orphanId }, data: { approvedById: survivorId } });
    await tx.incidentReport.updateMany({ where: { reporterUserId: orphanId }, data: { reporterUserId: survivorId } });
    await tx.incidentDecision.updateMany({ where: { decidedByUserId: orphanId }, data: { decidedByUserId: survivorId } });
    await tx.incidentReportComment.updateMany({ where: { authorUserId: orphanId }, data: { authorUserId: survivorId } });
    await tx.incidentReportEvidence.updateMany({ where: { addedByUserId: orphanId }, data: { addedByUserId: survivorId } });
    await tx.league.updateMany({ where: { createdById: orphanId }, data: { createdById: survivorId } });
    await tx.csvImport.updateMany({ where: { uploadedById: orphanId }, data: { uploadedById: survivorId } });

    // Carry over identity fields the survivor is missing — no data loss.
    // The survivor's own values always win where it already has them (its
    // Discord email and whatever it typed on its profile).
    const carryOver: Prisma.UserUpdateInput = {};
    if (!survivor.iracingMemberId && orphan.iracingMemberId) {
      carryOver.iracingMemberId = orphan.iracingMemberId;
    }
    if (!survivor.firstName && orphan.firstName) carryOver.firstName = orphan.firstName;
    if (!survivor.lastName && orphan.lastName) carryOver.lastName = orphan.lastName;
    if (!survivor.countryCode && orphan.countryCode) carryOver.countryCode = orphan.countryCode;
    // Never demote: if the orphan was a privileged account, keep that role.
    if (survivor.role === "DRIVER" && orphan.role !== "DRIVER") {
      carryOver.role = orphan.role;
    }
    if (Object.keys(carryOver).length > 0) {
      await tx.user.update({ where: { id: survivorId }, data: carryOver });
    }

    await tx.user.delete({ where: { id: orphanId } });
  });

  return {
    ok: true,
    survivorId,
    movedRegistrations: orphan.registrations.length,
  };
}
