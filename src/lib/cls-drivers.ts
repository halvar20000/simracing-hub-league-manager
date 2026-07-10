import { prisma } from "@/lib/prisma";

export type ClsDriverOption = { id: string; name: string };

/** All CLS drivers (users with at least one registration), for the stint
 *  planner's driver picker. Sorted by last then first name. */
export async function getClsDrivers(): Promise<ClsDriverOption[]> {
  const users = await prisma.user.findMany({
    where: { registrations: { some: {} } },
    select: { id: true, firstName: true, lastName: true, name: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { name: "asc" }],
  });
  return users.map((u) => {
    const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return { id: u.id, name: full || u.name || "Unknown driver" };
  });
}
