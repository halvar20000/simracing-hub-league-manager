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
