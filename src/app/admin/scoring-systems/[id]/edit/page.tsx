import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateScoringSystem } from "@/lib/actions/scoring-systems";

const MAX_POS = 30;

export default async function EditScoringSystem({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const ss = await prisma.scoringSystem.findUnique({
    where: { id },
    include: { _count: { select: { seasons: true } } },
  });
  if (!ss) notFound();

  const points = (ss.pointsTable as Record<string, number>) ?? {};
  const classPoints = (ss.classPointsTable as Record<string, number> | null) ?? {};
  const hasClass = Object.keys(classPoints).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/scoring-systems"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Scoring systems
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{ss.name}</h1>
        <p className="text-sm text-zinc-400">
          Used by {ss._count.seasons} season{ss._count.seasons === 1 ? "" : "s"}.
          Saving recomputes every round of every season using this system.
        </p>
      </div>

      <form action={updateScoringSystem} className="space-y-6">
        <input type="hidden" name="id" value={ss.id} />

        <Section title="Description">
          <textarea
            name="description"
            defaultValue={ss.description ?? ""}
            rows={2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Optional description"
          />
        </Section>

        <Section title="Overall points table">
          <PointsGrid
            prefix="pos"
            values={points}
            placeholder="(no pts)"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Leave a position blank if it should award 0 points.
          </p>
        </Section>

        <Section title={hasClass ? "Class points table (Pro/Am)" : "Class points table (currently empty — fill to enable separate per-class scoring)"}>
          <PointsGrid
            prefix="classPos"
            values={classPoints}
            placeholder="(no pts)"
          />
        </Section>

        <Section title="Participation">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field
              label="Participation points"
              name="participationPoints"
              type="number"
              defaultValue={String(ss.participationPoints)}
              min={0}
            />
            <Field
              label="Min distance % to qualify for participation pts"
              name="participationMinDistancePct"
              type="number"
              defaultValue={String(ss.participationMinDistancePct)}
              min={0}
              max={100}
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              name="participationInCombined"
              defaultChecked={ss.participationInCombined}
              className="h-4 w-4"
            />
            Include participation points in <strong>combined</strong> standings
            <span className="ml-2 text-xs text-zinc-500">
              (Class and Team scoring always include participation)
            </span>
          </label>
        </Section>

        <Section title="Bonuses">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field
              label="Fastest lap bonus"
              name="bonusFastestLap"
              type="number"
              defaultValue={ss.bonusFastestLap != null ? String(ss.bonusFastestLap) : ""}
              placeholder="blank = none"
            />
            <Field
              label="Pole bonus"
              name="bonusPole"
              type="number"
              defaultValue={ss.bonusPole != null ? String(ss.bonusPole) : ""}
              placeholder="blank = none"
            />
            <Field
              label="Most laps led bonus"
              name="bonusMostLapsLed"
              type="number"
              defaultValue={ss.bonusMostLapsLed != null ? String(ss.bonusMostLapsLed) : ""}
              placeholder="blank = none"
            />
          </div>
        </Section>

        <Section title="Drop weeks">
          <Field
            label="Drop worst N rounds (blank = no drop)"
            name="dropWorstNRounds"
            type="number"
            defaultValue={ss.dropWorstNRounds != null ? String(ss.dropWorstNRounds) : ""}
            min={0}
            max={20}
            placeholder="blank = no drop"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Missed rounds (no result) are dropped first; remaining slots fall to
            each driver&apos;s lowest-scoring raced rounds. Penalties are never
            erased by drop.
          </p>
        </Section>

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/scoring-systems"
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save (recomputes seasons)
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PointsGrid({
  prefix,
  values,
  placeholder,
}: {
  prefix: string;
  values: Record<string, number>;
  placeholder: string;
}) {
  const positions = Array.from({ length: MAX_POS }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10">
      {positions.map((p) => {
        const v = values[String(p)];
        return (
          <label key={p} className="block">
            <span className="mb-1 block text-[10px] text-zinc-500">P{p}</span>
            <input
              name={`${prefix}_${p}`}
              type="number"
              defaultValue={v != null ? String(v) : ""}
              placeholder={placeholder}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm tabular-nums text-zinc-100"
            />
          </label>
        );
      })}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: "text" | "number";
  defaultValue?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
      />
    </label>
  );
}
