"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function promoteUserToAdmin(userId: string) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { role: "ADMIN" },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function demoteUserToDriver(userId: string) {
  const me = await requireAdmin();
  // Don't allow demoting yourself (avoid locking out)
  if (me.id === userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { role: "DRIVER" },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setUserActive(userId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
  revalidatePath("/admin/users");
}
