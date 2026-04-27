import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }
  return session.user;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return user;
}

/**
 * Allows STEWARD or ADMIN access (used for incident reports / decisions).
 */
export async function requireSteward() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user || (user.role !== "ADMIN" && user.role !== "STEWARD")) {
    redirect("/");
  }

  return user;
}
