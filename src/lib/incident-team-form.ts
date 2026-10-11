import { prisma } from "@/lib/prisma";

/**
 * Reads the driver named for each accused team from an incident form
 * (`involvedTeamDriver:<teamId>`, written by InvolvedTeamsPicker) and keeps
 * only registrations of this season. Shared by the driver's "file a report"
 * action and the admin edit — kept out of the "use server" files on purpose.
 */
export async function namedTeamDrivers(
  formData: FormData,
  seasonId: string,
  teamIds: string[]
): Promise<Map<string, string>> {
  const wanted = new Map<string, string>();
  for (const teamId of teamIds) {
    const reg = String(formData.get(`involvedTeamDriver:${teamId}`) ?? "").trim();
    if (reg) wanted.set(teamId, reg);
  }
  if (wanted.size === 0) return wanted;
  const valid = await prisma.registration.findMany({
    where: { id: { in: [...wanted.values()] }, seasonId },
    select: { id: true },
  });
  const ok = new Set(valid.map((r) => r.id));
  return new Map([...wanted].filter(([, reg]) => ok.has(reg)));
}
