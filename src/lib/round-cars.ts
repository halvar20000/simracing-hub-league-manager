import type { PrismaClient } from "@prisma/client";

/**
 * The cars (team entries) of one round, with the drivers who sat in each —
 * what an incident report on a team-mode season (IEC) is about.
 *
 * Once results are imported, a car is a TeamResult and its crew are the
 * drivers who actually took a stint (TeamRoundDriver). That matters: crews
 * mix drivers registered with different teams (IEC 3h Fuji). Before the
 * import, every team of the season is listed with its registered drivers.
 * Pure data helper — not "use server".
 */
export type RoundCar = {
  teamId: string;
  teamName: string;
  /** Car class short code (e.g. GT3) when known. */
  classLabel: string | null;
  crew: { registrationId: string; label: string }[];
};

function driverLabel(reg: {
  startNumber: string | null;
  user: { firstName: string | null; lastName: string | null };
}): string {
  const name = `${reg.user.firstName ?? ""} ${reg.user.lastName ?? ""}`.trim();
  return name || "(ohne Name)";
}

export async function loadRoundCars(
  prisma: PrismaClient,
  roundId: string,
  seasonId: string
): Promise<RoundCar[]> {
  const results = await prisma.teamResult.findMany({
    where: { roundId },
    include: {
      team: { select: { id: true, name: true } },
      carClass: { select: { shortCode: true } },
      participations: {
        include: {
          registration: {
            select: {
              id: true,
              startNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  const byTeam = new Map<string, RoundCar>();
  for (const r of results) {
    const car = byTeam.get(r.team.id) ?? {
      teamId: r.team.id,
      teamName: r.team.name,
      classLabel: r.carClass?.shortCode ?? null,
      crew: [],
    };
    for (const p of r.participations) {
      if (car.crew.some((c) => c.registrationId === p.registration.id)) continue;
      car.crew.push({
        registrationId: p.registration.id,
        label: driverLabel(p.registration),
      });
    }
    byTeam.set(r.team.id, car);
  }

  if (byTeam.size === 0) {
    // No results yet — fall back to the season's teams and their drivers.
    const teams = await prisma.team.findMany({
      where: { seasonId },
      include: {
        registrations: {
          where: { status: "APPROVED", isTeamManager: false },
          select: {
            id: true,
            startNumber: true,
            user: { select: { firstName: true, lastName: true } },
            carClass: { select: { shortCode: true } },
          },
        },
        // Drivers entered with this team as an extra team (TeamMembership).
        extraMembers: {
          where: { registration: { status: "APPROVED", isTeamManager: false } },
          select: {
            carClass: { select: { shortCode: true } },
            registration: {
              select: {
                id: true,
                startNumber: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    for (const t of teams) {
      if (t.registrations.length === 0 && t.extraMembers.length === 0) continue;
      byTeam.set(t.id, {
        teamId: t.id,
        teamName: t.name,
        classLabel:
          t.registrations.find((r) => r.carClass)?.carClass?.shortCode ??
          t.extraMembers.find((m) => m.carClass)?.carClass?.shortCode ??
          null,
        crew: [
          ...t.registrations.map((r) => ({
            registrationId: r.id,
            label: driverLabel(r),
          })),
          ...t.extraMembers.map((m) => ({
            registrationId: m.registration.id,
            label: driverLabel(m.registration),
          })),
        ],
      });
    }
  }

  return [...byTeam.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
  );
}

/**
 * The car a registration drove in this round, else the team it is registered
 * with — used to keep a reporter from accusing their own car.
 */
export function carOfRegistration(
  cars: RoundCar[],
  registrationId: string | null | undefined,
  registeredTeamId: string | null | undefined
): string | null {
  if (!registrationId) return registeredTeamId ?? null;
  const drove = cars.find((c) =>
    c.crew.some((m) => m.registrationId === registrationId)
  );
  return drove?.teamId ?? registeredTeamId ?? null;
}
