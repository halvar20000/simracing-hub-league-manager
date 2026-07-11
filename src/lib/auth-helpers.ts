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

/**
 * Soft, non-redirecting check: is the current viewer an ADMIN or STEWARD?
 * Used to gate admin-only previews on otherwise-public pages (e.g. seeing a
 * round's results/standings before it is marked COMPLETED). Returns false for
 * signed-out users and ordinary drivers — never redirects.
 */
export async function isAdminOrSteward(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return user?.role === "ADMIN" || user?.role === "STEWARD";
}

/** Soft, non-redirecting check: is the current viewer an ADMIN (only)? */
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return user?.role === "ADMIN";
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
