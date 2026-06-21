import { prisma } from "@/lib/prisma";
import {
  groupTeamsAcrossSeasons,
  type AggTeamInput,
} from "@/lib/team-grouping";
import TeamsOverview from "@/components/TeamsOverview";

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Teams",
  description:
    "Every team across all CAS leagues and seasons. Click a team to see its drivers. Subteams are grouped under their main team.",
  url: "/teams",
});

export default async function TeamsPage() {
  // All teams across every non-archived league's seasons (any status, incl.
  // completed). Only approved, driving registrations count as "drivers".
  const teams = await prisma.team.findMany({
    where: { season: { league: { isArchived: false } } },
    select: {
      name: true,
      logoUrl: true,
      season: {
        select: {
          name: true,
          year: true,
          league: { select: { name: true, slug: true } },
        },
      },
      registrations: {
        where: { status: "APPROVED", isTeamManager: false },
        select: {
          startNumber: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              countryCode: true,
              iracingMemberId: true,
            },
          },
        },
      },
    },
  });

  const groups = groupTeamsAcrossSeasons(teams as AggTeamInput[]).filter(
    (g) => g.driverCount > 0
  );

  const totalDrivers = groups.reduce((s, g) => s + g.driverCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {groups.length} teams across all leagues and seasons · {totalDrivers}{" "}
          drivers. Subteams (e.g. colour or lettered entries) are grouped under
          their main team. Click a team to see its drivers.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No teams yet.
        </p>
      ) : (
        <TeamsOverview groups={groups} />
      )}
    </div>
  );
}
