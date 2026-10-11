/**
 * One-line "who is accused" label for incident lists.
 *
 * Team-mode reports (IEC, since v2.39.0) name TEAMS — the car — and, when the
 * reporter knew it, the driver at the wheel: "Team A (Driver X), Team B".
 * Older team-mode reports tagged every registered member instead; those are
 * shown by team, without driver names. Solo leagues list the drivers.
 * Pure — no Prisma.
 */
type DriverRow = {
  role: string;
  registrationId: string;
  registration: {
    startNumber?: string | null;
    teamId?: string | null;
    team?: { name: string } | null;
    user: { firstName: string | null; lastName: string | null };
  };
};
type TeamRow = {
  role: string;
  teamId: string;
  /** Driver named for this car (IncidentReportInvolvedTeam.registrationId). */
  registrationId: string | null;
  team: { name: string };
};

const nameOf = (d: DriverRow) =>
  `${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim();

export function accusedLabel(
  report: { involvedDrivers: DriverRow[]; involvedTeams?: TeamRow[] },
  opts: { teamMode?: boolean; withNumbers?: boolean } = {}
): string {
  const drivers = report.involvedDrivers.filter((d) => d.role === "ACCUSED");
  const teams = (report.involvedTeams ?? []).filter((t) => t.role === "ACCUSED");

  if (teams.length > 0) {
    return teams
      .map((t) => {
        const named = t.registrationId
          ? report.involvedDrivers.find((d) => d.registrationId === t.registrationId)
          : undefined;
        return named ? `${t.team.name} (${nameOf(named)})` : t.team.name;
      })
      .join(", ");
  }

  if (opts.teamMode) {
    const names = [
      ...new Set(
        drivers.map((d) => d.registration.team?.name).filter((n): n is string => !!n)
      ),
    ];
    if (names.length > 0) return names.join(", ");
  }

  return drivers
    .map((d) =>
      opts.withNumbers && d.registration.startNumber
        ? `#${d.registration.startNumber} ${nameOf(d)}`
        : nameOf(d)
    )
    .join(", ");
}
