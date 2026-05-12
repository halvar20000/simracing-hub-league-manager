#!/usr/bin/env bash
# Admin scoring-systems pages + update action.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/app/admin/scoring-systems
mkdir -p 'src/app/admin/scoring-systems/[id]/edit'
mkdir -p src/lib/actions

# ----------------------------------------------------------------
# 1) Server action
# ----------------------------------------------------------------
cat > src/lib/actions/scoring-systems.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";

function readIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function readPointsTable(
  formData: FormData,
  prefix: string,
  maxPos: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i <= maxPos; i++) {
    const v = formData.get(`${prefix}_${i}`);
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) out[String(i)] = n;
  }
  return out;
}

export async function updateScoringSystem(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const description = String(formData.get("description") ?? "").trim() || null;

  const participationPoints =
    readIntOrNull(formData.get("participationPoints")) ?? 0;
  const participationMinDistancePct =
    readIntOrNull(formData.get("participationMinDistancePct")) ?? 75;
  const bonusFastestLap = readIntOrNull(formData.get("bonusFastestLap"));
  const bonusPole = readIntOrNull(formData.get("bonusPole"));
  const bonusMostLapsLed = readIntOrNull(formData.get("bonusMostLapsLed"));
  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));

  const pointsTable = readPointsTable(formData, "pos", 30);
  const classPointsTableObj = readPointsTable(formData, "classPos", 30);
  const classPointsTable =
    Object.keys(classPointsTableObj).length > 0 ? classPointsTableObj : null;

  await prisma.scoringSystem.update({
    where: { id },
    data: {
      description,
      pointsTable,
      classPointsTable: classPointsTable === null ? null : classPointsTable,
      participationPoints,
      participationMinDistancePct,
      bonusFastestLap,
      bonusPole,
      bonusMostLapsLed,
      dropWorstNRounds,
    },
  });

  // Recompute scoring on every round of every season that uses this system.
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: id },
    select: { id: true },
  });
  if (seasons.length > 0) {
    const seasonIds = seasons.map((s) => s.id);
    const rounds = await prisma.round.findMany({
      where: { seasonId: { in: seasonIds }, raceResults: { some: {} } },
      select: { id: true },
    });
    for (const r of rounds) {
      await recomputeRoundScoring(prisma, r.id);
    }
  }

  revalidatePath("/admin/scoring-systems");
  revalidatePath(`/admin/scoring-systems/${id}/edit`);
  redirect("/admin/scoring-systems?saved=1");
}
EOF

# ----------------------------------------------------------------
# 2) List page
# ----------------------------------------------------------------
cat > src/app/admin/scoring-systems/page.tsx <<'EOF'
import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ScoringSystemsList({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { saved } = await searchParams;

  const systems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { seasons: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Scoring systems</h1>
        <p className="text-sm text-zinc-400">
          Define how points are awarded per position, plus participation,
          bonuses, and drop-week rules. Changes recompute every round of
          every season using the system.
        </p>
      </div>

      {saved && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Saved.
        </div>
      )}

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Seasons</th>
              <th className="px-3 py-2 text-right">P1 pts</th>
              <th className="px-3 py-2 text-right">Part. pts</th>
              <th className="px-3 py-2 text-right">Drop weeks</th>
              <th className="px-3 py-2 text-right">FL bonus</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {systems.map((s) => {
              const tbl = (s.pointsTable as Record<string, number>) ?? {};
              const p1 = tbl["1"] ?? null;
              return (
                <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">
                    {s._count.seasons}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p1 ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.participationPoints} @ {s.participationMinDistancePct}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.dropWorstNRounds ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.bonusFastestLap ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/scoring-systems/${s.id}/edit`}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF

# ----------------------------------------------------------------
# 3) Edit page
# ----------------------------------------------------------------
cat > 'src/app/admin/scoring-systems/[id]/edit/page.tsx' <<'EOF'
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
EOF

echo ""
echo "=== Files written ==="
ls -la src/app/admin/scoring-systems/page.tsx
ls -la 'src/app/admin/scoring-systems/[id]/edit/page.tsx'
ls -la src/lib/actions/scoring-systems.ts

echo ""
echo "=== Add a nav link from /admin (if the page exists and has a nav block) ==="
ADMIN_PAGE='src/app/admin/page.tsx'
if [ -f "$ADMIN_PAGE" ]; then
  echo "/admin exists — looking for a place to insert a Scoring Systems link"
  if grep -q "scoring-systems" "$ADMIN_PAGE"; then
    echo "  link already present"
  else
    # Insert a small linked card if there's an obvious spot. We try a marker
    # but if the file doesn't have something obvious, we just print a note
    # so you can add the link manually.
    if grep -q '/admin/leagues' "$ADMIN_PAGE"; then
      echo "  (heuristic) /admin page mentions /admin/leagues; you can add a"
      echo "  '/admin/scoring-systems' link next to it. We do not auto-edit"
      echo "  the home page since it's structured differently across projects."
    fi
  fi
else
  echo "/admin/page.tsx not found — go directly to /admin/scoring-systems"
fi

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin: scoring systems list + edit page (points table, drop weeks, participation, bonuses)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then visit: https://league.simracing-hub.com/admin/scoring-systems"
echo "Edit any system to verify the form works. After Save, the page reloads"
echo "with '?saved=1' and every season using that system has its rounds"
echo "recomputed."
