import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import DebriefView from "@/components/DebriefView";
import {
  DebriefBackLink,
  NoDebriefAccess,
  NoDebriefYet,
} from "@/components/planner/DebriefPageChrome";
import {
  canAccessStintPlan,
  canManageStintPlan,
  getStintPlanViewer,
} from "@/lib/stint-plan-access";
import {
  debriefForPlan,
  readDebriefHistory,
  type DebriefHistory,
} from "@/lib/debrief-server";
import { resolvePlanTeam, teamPickerOptions } from "@/lib/plan-team";
import { fieldForPlan } from "@/lib/race-log-field-server";
import { buildFieldBench } from "@/lib/debrief-field";
import { teamGroupSlug } from "@/lib/team-grouping";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  return pageMetadata({
    title: plan ? `${plan.title} — De-briefing` : "De-briefing",
    description:
      "Auswertung nach dem Rennen: Auszeichnungen, Kennzahlen je Fahrer und der Verlauf über die Saison.",
    url: `/stint-planner/${id}/debriefing`,
  });
}

/** History → the plain shape the client component draws. */
function serializeHistory(h: DebriefHistory) {
  return {
    races: h.races.map((r) => ({
      sourceKey: r.sourceKey,
      label: r.label,
      racedAtMs: r.racedAt.getTime(),
      imported: r.source === "import",
    })),
    byDriver: Array.from(h.byDriver.entries()).map(([name, points]) => ({
      name,
      points: points.map((p) =>
        p
          ? {
              relPerf: p.relPerfPpm == null ? null : p.relPerfPpm / 1_000_000,
              perf10k: p.perf10kPpm == null ? null : p.perf10kPpm / 1_000_000,
              consistency:
                p.consistencyPpm == null ? null : p.consistencyPpm / 1_000_000,
            }
          : null
      ),
    })),
  };
}

export default async function DebriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getStintPlanViewer();
  if (!viewer) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        `/stint-planner/${id}/debriefing`
      )}`
    );
  }

  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      payload: true,
      updatedAt: true,
      archivedAt: true,
      createdByUserId: true,
      accessUserIds: true,
      teamId: true,
    },
  });
  if (!plan) notFound();

  // Exactly the plan's own rule — a debriefing is as private as the plan it
  // comes from. src/lib/stint-plan-access.ts is the single definition.
  if (!canAccessStintPlan(plan, viewer)) return <NoDebriefAccess />;

  const built = await debriefForPlan(plan);
  if (!built) {
    return <NoDebriefYet planId={id} planTitle={plan.title} />;
  }

  const history = await readDebriefHistory(built.data.drivers.map((d) => d.name));
  // The rest of the field, from the same raw log. Best-effort by contract:
  // a blob store having a bad day must not take the de-briefing with it.
  const fieldCtx = await fieldForPlan(plan, built.state);
  const field = fieldCtx
    ? buildFieldBench(fieldCtx.model, fieldCtx.ownCarNumber, {
        shared: fieldCtx.shared,
      })
    : null;
  const canManage = canManageStintPlan(plan, viewer);
  const team = await resolvePlanTeam(plan, built.state);
  // The picker is only worth loading for someone who may actually change it.
  const teamOptions = canManage ? await teamPickerOptions() : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <DebriefBackLink planId={id} />
      <DebriefView
        planId={plan.id}
        data={built.data}
        history={serializeHistory(history)}
        postNotes={built.state.notes.post ?? ""}
        canManage={canManage}
        race={built.race}
        field={field}
        team={{
          ...team,
          slug: team.teamGroup ? teamGroupSlug(team.teamGroup) : null,
          currentTeamId: plan.teamId,
        }}
        teamOptions={teamOptions}
      />
    </main>
  );
}
