import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import DebriefView from "@/components/DebriefView";
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
      planId: r.planId,
      label: r.label,
      racedAtMs: r.racedAt.getTime(),
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
    },
  });
  if (!plan) notFound();

  // Exactly the plan's own rule — a debriefing is as private as the plan it
  // comes from. src/lib/stint-plan-access.ts is the single definition.
  if (!canAccessStintPlan(plan, viewer)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">
          Dieses De-briefing ist nicht für dich freigegeben
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Es gehört zu einem Stintplan, den nur der Ersteller, die eingetragenen
          Fahrer, die von ihm hinzugefügten Personen und CLS-Admins öffnen
          können.
        </p>
        <Link
          href="/stint-planner"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Deine Stintpläne
        </Link>
      </main>
    );
  }

  const built = await debriefForPlan(plan);
  if (!built) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">Noch kein De-briefing</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Für <span className="text-zinc-200">{plan.title}</span> ist noch kein
          Race-Log hochgeladen. Lade das <span className="font-mono">.jsonl</span>{" "}
          des Race Loggers und — bei einem Teamrennen — die{" "}
          <span className="font-mono">eventresult.json</span> im Plan hoch, dann
          steht die Auswertung hier.
        </p>
        <Link
          href={`/stint-planner/${id}`}
          className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          → Zum Stintplan
        </Link>
      </main>
    );
  }

  const history = await readDebriefHistory(built.data.drivers.map((d) => d.name));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 text-sm print:hidden">
        <Link
          href={`/stint-planner/${id}`}
          className="text-zinc-400 hover:text-[#ff6b35]"
        >
          ← Zurück zum Stintplan
        </Link>
      </div>
      <DebriefView
        planId={plan.id}
        data={built.data}
        history={serializeHistory(history)}
        postNotes={built.state.notes.post ?? ""}
        canManage={canManageStintPlan(plan, viewer)}
      />
    </main>
  );
}
