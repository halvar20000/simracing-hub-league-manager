"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { mergeUserAccounts } from "@/lib/merge-users";

export async function updateProfile(formData: FormData) {
  const sessionUser = await requireAuth();

  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const iracingMemberIdRaw = String(formData.get("iracingMemberId") ?? "").trim();
  const iracingMemberId = iracingMemberIdRaw || null;

  if (iracingMemberId && !/^\d+$/.test(iracingMemberId)) {
    redirect("/profile?error=iRacing+member+ID+must+be+a+number");
  }

  // If another account already holds this iRacing ID it is almost always a
  // duplicate of this same driver — an admin pre-created their account
  // (with iRacing ID + registrations) before they first signed in with
  // Discord, and the name-based auto-link in auth.ts didn't match. Merge
  // that orphan into the logged-in account instead of rejecting the save.
  if (iracingMemberId) {
    const holder = await prisma.user.findUnique({
      where: { iracingMemberId },
      select: { id: true },
    });
    if (holder && holder.id !== sessionUser.id) {
      const merged = await mergeUserAccounts(prisma, holder.id, sessionUser.id);
      if (!merged.ok) {
        redirect(
          `/profile?error=${encodeURIComponent(
            `That iRacing ID belongs to another account that could not be merged automatically — ${merged.reason}. Please contact a league admin.`
          )}`
        );
      }
    }
  }

  try {
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { firstName, lastName, email, iracingMemberId },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      redirect("/profile?error=That+iRacing+ID+is+already+used+by+another+account");
    }
    throw e;
  }

  revalidatePath("/profile");
  redirect("/profile?success=1");
}

export type IracingLookupResult =
  | { status: "new" }
  | { status: "self" }
  | { status: "orphan"; firstName: string; lastName: string }
  | { status: "conflict"; firstName: string; lastName: string };

/**
 * Live lookup used by the profile form: given an iRacing ID, report whether
 * it already belongs to an account. Lets the form greet a returning driver
 * by name and pre-fill it. Auth-gated — only signed-in users can call it.
 *
 *  - "new"      no account holds this ID
 *  - "self"     the signed-in user already holds this ID
 *  - "orphan"   another account holds it but has no Discord login — it will
 *               be merged into the signed-in account on save
 *  - "conflict" another account holds it AND has its own Discord login —
 *               a real clash that needs an admin
 */
export async function lookupIracingId(
  iracingMemberId: string
): Promise<IracingLookupResult> {
  const sessionUser = await requireAuth();
  const id = String(iracingMemberId ?? "").trim();
  if (!/^\d+$/.test(id)) return { status: "new" };

  const holder = await prisma.user.findUnique({
    where: { iracingMemberId: id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      _count: { select: { accounts: true } },
    },
  });
  if (!holder) return { status: "new" };
  if (holder.id === sessionUser.id) return { status: "self" };

  const name = {
    firstName: holder.firstName ?? "",
    lastName: holder.lastName ?? "",
  };
  return holder._count.accounts > 0
    ? { status: "conflict", ...name }
    : { status: "orphan", ...name };
}
