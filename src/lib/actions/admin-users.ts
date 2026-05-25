"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { Role } from "@prisma/client";

export async function setUserRole(userId: string, role: Role) {
  const me = await requireAdmin();
  // Don't allow yourself to lose admin
  if (me.id === userId && role !== "ADMIN") return;
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setUserActive(userId: string, isActive: boolean) {
  const me = await requireAdmin();
  // Don't allow an admin to deactivate / soft-delete their own account —
  // that would lock them out of the very page they're on.
  if (me.id === userId && !isActive) return;
  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export type UpdateUserResult = { ok: true } | { ok: false; error: string };

/**
 * Admin edit of another driver's profile fields. Mirrors the self-service
 * `updateProfile` in `profile.ts` but is admin-gated and edits an arbitrary
 * user by id. Returns a result object (it is called programmatically from
 * the AdminUserRow client component, not used directly as a `<form action>`),
 * so validation problems surface inline instead of via a redirect.
 */
export async function updateUserProfile(
  userId: string,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    iracingMemberId: string;
    countryCode: string;
  }
): Promise<UpdateUserResult> {
  await requireAdmin();

  const firstName = input.firstName.trim() || null;
  const lastName = input.lastName.trim() || null;
  const email = input.email.trim() || null;
  const iracingMemberId = input.iracingMemberId.trim() || null;
  const countryCode = input.countryCode.trim().toUpperCase() || null;

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address looks invalid." };
  }
  if (iracingMemberId && !/^\d+$/.test(iracingMemberId)) {
    return { ok: false, error: "iRacing member ID must be a number." };
  }
  if (countryCode && !/^[A-Z]{2,3}$/.test(countryCode)) {
    return {
      ok: false,
      error: "Country must be a 2–3 letter code (e.g. DE, FR, CH).",
    };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName, email, iracingMemberId, countryCode },
    });
  } catch (e: unknown) {
    // email and iracingMemberId are both @unique — a clash means the value
    // already belongs to another account.
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return {
        ok: false,
        error:
          "That email or iRacing member ID is already used by another account.",
      };
    }
    throw e;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}
