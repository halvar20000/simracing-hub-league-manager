"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function updateProfile(formData: FormData) {
  const sessionUser = await requireAuth();

  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const iracingMemberIdRaw = String(formData.get("iracingMemberId") ?? "").trim();
  const iracingMemberId = iracingMemberIdRaw || null;

  // Garage 61 profile URL — optional, must point at garage61.net if set.
  const garage61Raw = String(formData.get("garage61Url") ?? "").trim();
  const garage61Url = garage61Raw || null;
  if (
    garage61Url &&
    !/^https?:\/\/(www\.)?garage61\.net\//i.test(garage61Url)
  ) {
    redirect(
      "/profile?error=Garage+61+URL+must+start+with+https%3A%2F%2Fgarage61.net%2F"
    );
  }

  if (iracingMemberId && !/^\d+$/.test(iracingMemberId)) {
    redirect("/profile?error=iRacing+member+ID+must+be+a+number");
  }

  try {
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { firstName, lastName, email, iracingMemberId, garage61Url },
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
