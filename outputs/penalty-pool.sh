#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: PenaltyCategory enum + Penalty fields + deferPenaltyPoints flag
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// 1a. PenaltyCategory enum
if (!/^enum\s+PenaltyCategory\s*{/m.test(s)) {
  s += `

enum PenaltyCategory {
  AVOIDABLE_CONTACT
  CAUSING_COLLISION
  BLOCKING
  TRACK_LIMITS
  JUMP_START
  IGNORING_BLUE_FLAGS
  UNSPORTSMANLIKE
  CHAT_MISCONDUCT
  OTHER
}
`;
  console.log("Added PenaltyCategory enum.");
}

// 1b. Add fields to Penalty model
{
  const lines = s.split("\n");
  let inModel = false;
  let close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+Penalty\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("Penalty model brace not found."); process.exit(1); }

  const additions = [];
  if (!/^\s*category\s+PenaltyCategory\?/m.test(s)) additions.push("  category        PenaltyCategory?");
  if (!/^\s*releasedAt\s+DateTime\?/m.test(s))     additions.push("  releasedAt      DateTime?");
  if (!/^\s*forgivenPoints\s+Int/m.test(s))       additions.push("  forgivenPoints  Int                @default(0)");
  if (!/^\s*forgivenAt\s+DateTime\?/m.test(s))    additions.push("  forgivenAt      DateTime?");
  if (!/^\s*forgivenReason\s+String\?/m.test(s))  additions.push("  forgivenReason  String?");

  if (additions.length > 0) {
    lines.splice(close, 0, ...additions);
    s = lines.join("\n");
    console.log(`Penalty: added ${additions.length} field(s).`);
  }
}

// 1c. Add deferPenaltyPoints to ScoringSystem
{
  const lines = s.split("\n");
  let inModel = false;
  let close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+ScoringSystem\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("ScoringSystem model brace not found."); process.exit(1); }
  if (!/^\s*deferPenaltyPoints\s+Boolean/m.test(s)) {
    lines.splice(close, 0, "  deferPenaltyPoints       Boolean @default(false)");
    s = lines.join("\n");
    console.log("ScoringSystem: added deferPenaltyPoints.");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. Edit form for ScoringSystem: add deferPenaltyPoints checkbox
# ===========================================================================
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes('name="deferPenaltyPoints"')) {
  console.log("Edit form: deferPenaltyPoints already wired.");
} else {
  // Insert a new section just before "Drop weeks"
  const before = `        <Section title="Drop weeks">`;
  const insert = `        <Section title="Penalty points application">
          <label className="flex items-start gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              name="deferPenaltyPoints"
              defaultChecked={ss.deferPenaltyPoints}
              className="mt-0.5 h-4 w-4 accent-orange-500"
            />
            <span>
              <span className="font-medium">
                Defer penalty points to end of season
              </span>
              <span className="ml-1 block text-xs text-zinc-500">
                When checked, points-deduction penalties accumulate in a
                Penalty Pool and only hit the standings once an admin releases
                them at season end (with optional forgiveness for clean racing).
                When unchecked, penalties are subtracted from standings
                immediately as decisions are published.
              </span>
            </span>
          </label>
        </Section>

        <Section title="Drop weeks">`;
  if (!s.includes(before)) { console.error("Edit form: 'Drop weeks' anchor not found."); process.exit(1); }
  s = s.replace(before, insert);
  fs.writeFileSync(FILE, s);
  console.log("Edit form: deferPenaltyPoints section wired.");
}
EOF
node outputs-tmp/patch-edit.mjs

# ===========================================================================
# 3. updateScoringSystem action: save deferPenaltyPoints
# ===========================================================================
cat > outputs-tmp/patch-action-ss.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes("deferPenaltyPoints")) {
  // Add read line near other booleans.
  s = s.replace(
    `  const participationInCombined = formData.get("participationInCombined") === "on";`,
    `  const participationInCombined = formData.get("participationInCombined") === "on";
  const deferPenaltyPoints = formData.get("deferPenaltyPoints") === "on";`
  );
  // Add to update data block.
  s = s.replace(
    `      participationInCombined,
    },`,
    `      participationInCombined,
      deferPenaltyPoints,
    },`
  );
  fs.writeFileSync(FILE, s);
  console.log("Action: deferPenaltyPoints wired.");
} else {
  console.log("Action: deferPenaltyPoints already wired.");
}
EOF
node outputs-tmp/patch-action-ss.mjs

# ===========================================================================
# 4. Steward decision form: add Category dropdown
# ===========================================================================
cat > outputs-tmp/patch-decision-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 4a. Add CATEGORIES constant near VERDICTS
if (!s.includes("CATEGORIES")) {
  s = s.replace(
    `const VERDICTS = [`,
    `const CATEGORIES = [
  { value: "", label: "—" },
  { value: "AVOIDABLE_CONTACT", label: "Avoidable contact" },
  { value: "CAUSING_COLLISION", label: "Causing a collision" },
  { value: "BLOCKING", label: "Blocking" },
  { value: "TRACK_LIMITS", label: "Track limits" },
  { value: "JUMP_START", label: "Jump start" },
  { value: "IGNORING_BLUE_FLAGS", label: "Ignoring blue flags" },
  { value: "UNSPORTSMANLIKE", label: "Unsportsmanlike conduct" },
  { value: "CHAT_MISCONDUCT", label: "Chat misconduct" },
  { value: "OTHER", label: "Other" },
];

const VERDICTS = [`
  );
}

// 4b. Insert the Category select right after the Verdict select.
const verdictBlock = `          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Verdict</span>
            <select
              name="verdict"
              defaultValue={report.decision?.verdict ?? "NO_ACTION"}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {VERDICTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>`;
if (s.includes(verdictBlock) && !s.includes('name="penaltyCategory"')) {
  // Find the closing of the verdict label and insert a new label after it.
  const fullVerdictLabel = `          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Verdict</span>
            <select
              name="verdict"`;
  const insertAfter =
`          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Penalty category</span>
            <select
              name="penaltyCategory"
              defaultValue={(report.decision?.penalties?.[0]?.category as string | null | undefined) ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value || "none"} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              Used for analytics and the penalty pool. Points are still set
              by the value field below.
            </span>
          </label>
`;
  // Find the </select></label> closing the verdict label and inject after.
  const closeVerdict = `              ))}
            </select>
          </label>`;
  // Find the FIRST occurrence which corresponds to the verdict label.
  const idx = s.indexOf(closeVerdict);
  if (idx === -1) { console.error("Decision form: verdict label closing not found."); process.exit(1); }
  s = s.slice(0, idx + closeVerdict.length) + "\n" + insertAfter + s.slice(idx + closeVerdict.length);
  fs.writeFileSync(FILE, s);
  console.log("Decision form: Category dropdown inserted.");
} else {
  console.log("Decision form: Category already present or anchor not found.");
}
EOF
node outputs-tmp/patch-decision-form.mjs

# ===========================================================================
# 5. submitDecision action: read + save category
# ===========================================================================
cat > outputs-tmp/patch-submit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/admin-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// Add type import for PenaltyCategory
if (!s.includes("PenaltyCategory")) {
  s = s.replace(
    `import type { IncidentStatus, Verdict } from "@prisma/client";`,
    `import type { IncidentStatus, Verdict, PenaltyCategory } from "@prisma/client";`
  );
}

// Read penaltyCategory
if (!s.includes("penaltyCategory")) {
  s = s.replace(
    `  const reason = (
    String(formData.get("penaltyReason") ?? "").trim() || publicSummary
  );`,
    `  const reason = (
    String(formData.get("penaltyReason") ?? "").trim() || publicSummary
  );
  const penaltyCategoryRaw = String(formData.get("penaltyCategory") ?? "").trim();
  const penaltyCategory = penaltyCategoryRaw
    ? (penaltyCategoryRaw as PenaltyCategory)
    : null;`
  );
}

// Add category field to penalty.create data
if (!s.includes("category: penaltyCategory")) {
  s = s.replace(
    `        reason,
      },
    });
  }`,
    `        reason,
        category: penaltyCategory,
      },
    });
  }`
  );
}

fs.writeFileSync(FILE, s);
console.log("submitDecision: category wired.");
EOF
node outputs-tmp/patch-submit.mjs

# ===========================================================================
# 6. Standings: respect deferPenaltyPoints + forgivenPoints
# ===========================================================================
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// Update the penalties include to fetch the new fields.
const beforeInclude =
`        penalties: {
          where: {
            type: "POINTS_DEDUCTION",
            ...(excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : {}),
          },
        },`;
const afterInclude =
`        penalties: {
          where: {
            type: "POINTS_DEDUCTION",
            ...(excludeRoundIds.length > 0
              ? { roundId: { notIn: excludeRoundIds } }
              : {}),
          },
          select: {
            pointsValue: true,
            forgivenPoints: true,
            releasedAt: true,
            roundId: true,
          },
        },`;
if (!s.includes("forgivenPoints: true")) {
  if (!s.includes(beforeInclude)) { console.error("Standings: penalties include anchor not found."); process.exit(1); }
  s = s.replace(beforeInclude, afterInclude);
}

// Compute deferred flag
if (!s.includes("const defersPenalties")) {
  s = s.replace(
    `  const includeParticipationInCombined =
    season?.scoringSystem.participationInCombined ?? true;`,
    `  const includeParticipationInCombined =
    season?.scoringSystem.participationInCombined ?? true;
  const defersPenalties = !!season?.scoringSystem?.deferPenaltyPoints;`
  );
}

// Replace the penalty-summing loop to honour deferred + forgiven
const beforeLoop =
`    for (const p of reg.penalties) {
      if (p.pointsValue != null) penalty += p.pointsValue;
    }`;
const afterLoop =
`    for (const p of reg.penalties) {
      if (p.pointsValue == null) continue;
      // Deferred systems: only released penalties hit the standings.
      if (defersPenalties && p.releasedAt == null) continue;
      const effective = Math.max(0, p.pointsValue - (p.forgivenPoints ?? 0));
      penalty += effective;
    }`;
if (!s.includes("// Deferred systems: only released penalties")) {
  if (!s.includes(beforeLoop)) { console.error("Standings: penalty-loop anchor not found."); process.exit(1); }
  s = s.replace(beforeLoop, afterLoop);
}

fs.writeFileSync(FILE, s);
console.log("Standings: deferred + forgiven logic wired.");
EOF
node outputs-tmp/patch-standings.mjs

# ===========================================================================
# 7. New action: src/lib/actions/penalty-pool.ts (forgive + release)
# ===========================================================================
mkdir -p src/lib/actions
cat > src/lib/actions/penalty-pool.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function forgivePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string,
  formData: FormData
) {
  await requireAdmin();
  const raw = String(formData.get("forgivenPoints") ?? "").trim();
  const forgivenPoints = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
  const reason = String(formData.get("forgivenReason") ?? "").trim() || null;

  await prisma.penalty.update({
    where: { id: penaltyId },
    data: {
      forgivenPoints,
      forgivenAt: forgivenPoints > 0 ? new Date() : null,
      forgivenReason: forgivenPoints > 0 ? reason : null,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function releasePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string
) {
  await requireAdmin();
  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { releasedAt: new Date() },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function unreleasePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string
) {
  await requireAdmin();
  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { releasedAt: null },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function releaseAllPending(leagueSlug: string, seasonId: string) {
  await requireAdmin();
  await prisma.penalty.updateMany({
    where: {
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      round: { seasonId },
    },
    data: { releasedAt: new Date() },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}
TS

# ===========================================================================
# 8. New page: /admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx
# ===========================================================================
mkdir -p 'src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool'
cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx' <<'TSX'
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  forgivePenalty,
  releasePenalty,
  unreleasePenalty,
  releaseAllPending,
} from "@/lib/actions/penalty-pool";

const CATEGORY_LABEL: Record<string, string> = {
  AVOIDABLE_CONTACT: "Avoidable contact",
  CAUSING_COLLISION: "Causing a collision",
  BLOCKING: "Blocking",
  TRACK_LIMITS: "Track limits",
  JUMP_START: "Jump start",
  IGNORING_BLUE_FLAGS: "Ignoring blue flags",
  UNSPORTSMANLIKE: "Unsportsmanlike",
  CHAT_MISCONDUCT: "Chat misconduct",
  OTHER: "Other",
};

export default async function PenaltyPoolPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireSteward();
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, scoringSystem: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const penalties = await prisma.penalty.findMany({
    where: {
      type: "POINTS_DEDUCTION",
      round: { seasonId },
    },
    include: {
      round: { select: { roundNumber: true, name: true } },
      registration: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
      sourceIncidentDecision: {
        include: { incidentReport: { select: { id: true } } },
      },
    },
    orderBy: [
      { releasedAt: { sort: "asc", nulls: "first" } },
      { round: { roundNumber: "asc" } },
    ],
  });

  // Aggregate per driver
  type Row = {
    registrationId: string;
    name: string;
    startNumber: number | null;
    pendingPoints: number;
    forgivenPoints: number;
    releasedPoints: number;
    penalties: typeof penalties;
  };
  const byDriver = new Map<string, Row>();
  for (const p of penalties) {
    const id = p.registrationId;
    let row = byDriver.get(id);
    if (!row) {
      row = {
        registrationId: id,
        name: `${p.registration.user.firstName ?? ""} ${
          p.registration.user.lastName ?? ""
        }`.trim(),
        startNumber: p.registration.startNumber,
        pendingPoints: 0,
        forgivenPoints: 0,
        releasedPoints: 0,
        penalties: [],
      };
      byDriver.set(id, row);
    }
    const pts = p.pointsValue ?? 0;
    const eff = Math.max(0, pts - p.forgivenPoints);
    if (p.releasedAt) row.releasedPoints += eff;
    else row.pendingPoints += eff;
    row.forgivenPoints += p.forgivenPoints;
    row.penalties.push(p);
  }
  const drivers = Array.from(byDriver.values()).sort(
    (a, b) =>
      b.pendingPoints + b.releasedPoints - (a.pendingPoints + a.releasedPoints)
  );

  const releaseAll = releaseAllPending.bind(null, slug, seasonId);

  const totals = {
    pending: drivers.reduce((s, d) => s + d.pendingPoints, 0),
    forgiven: drivers.reduce((s, d) => s + d.forgivenPoints, 0),
    released: drivers.reduce((s, d) => s + d.releasedPoints, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Penalty pool</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.deferPenaltyPoints
            ? "This scoring system DEFERS penalty points. Pending penalties are visible here but not in standings until released."
            : "This scoring system applies penalty points IMMEDIATELY. Pool view is read-only."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded bg-amber-900/40 px-2 py-1 text-amber-200">
            Pending: <strong>{totals.pending}</strong>
          </span>
          <span className="rounded bg-emerald-900/40 px-2 py-1 text-emerald-200">
            Forgiven: <strong>{totals.forgiven}</strong>
          </span>
          <span className="rounded bg-red-900/40 px-2 py-1 text-red-200">
            Released: <strong>{totals.released}</strong>
          </span>
        </div>
      </div>

      {season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (
        <form action={releaseAll}>
          <button
            type="submit"
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            Release all {totals.pending} pending points to standings
          </button>
          <span className="ml-2 text-xs text-zinc-500">
            (Use after end-of-season review)
          </span>
        </form>
      )}

      {drivers.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No penalty points decided yet.
        </p>
      ) : (
        <div className="space-y-3">
          {drivers.map((d) => (
            <details
              key={d.registrationId}
              className="rounded border border-zinc-800 bg-zinc-900 open:bg-zinc-900"
              open={d.pendingPoints > 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800">
                <span className="flex items-center gap-3">
                  {d.startNumber != null && (
                    <span className="text-xs text-zinc-500">#{d.startNumber}</span>
                  )}
                  <span className="font-medium">{d.name}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {d.pendingPoints > 0 && (
                    <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                      pending {d.pendingPoints}
                    </span>
                  )}
                  {d.forgivenPoints > 0 && (
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200">
                      forgiven {d.forgivenPoints}
                    </span>
                  )}
                  {d.releasedPoints > 0 && (
                    <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                      released {d.releasedPoints}
                    </span>
                  )}
                </span>
              </summary>
              <div className="border-t border-zinc-800 px-4 py-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Round</th>
                      <th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Reason</th>
                      <th className="px-2 py-1 text-right">Pts</th>
                      <th className="px-2 py-1 text-right">Forgive</th>
                      <th className="px-2 py-1 text-right">Effective</th>
                      <th className="px-2 py-1 text-right">Status</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.penalties.map((p) => {
                      const pts = p.pointsValue ?? 0;
                      const eff = Math.max(0, pts - p.forgivenPoints);
                      const released = !!p.releasedAt;
                      const forgive = forgivePenalty.bind(null, slug, seasonId, p.id);
                      const release = releasePenalty.bind(null, slug, seasonId, p.id);
                      const unrelease = unreleasePenalty.bind(null, slug, seasonId, p.id);
                      const reportId = p.sourceIncidentDecision?.incidentReport.id;
                      return (
                        <tr
                          key={p.id}
                          className="border-t border-zinc-800 align-top"
                        >
                          <td className="px-2 py-2">
                            R{p.round.roundNumber}
                            <div className="text-xs text-zinc-500">{p.round.name}</div>
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-300">
                            {p.category ? CATEGORY_LABEL[p.category] ?? p.category : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-400">
                            {p.reason}
                            {reportId && (
                              <Link
                                href={`/admin/leagues/${slug}/seasons/${seasonId}/reports/${reportId}`}
                                className="ml-2 text-orange-400 hover:underline"
                              >
                                report ↗
                              </Link>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{pts}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            <form action={forgive} className="inline-flex items-center gap-1">
                              <input
                                name="forgivenPoints"
                                type="number"
                                min={0}
                                max={pts}
                                defaultValue={p.forgivenPoints || ""}
                                placeholder="0"
                                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-right text-sm tabular-nums"
                              />
                              <input
                                name="forgivenReason"
                                type="text"
                                defaultValue={p.forgivenReason ?? ""}
                                placeholder="reason"
                                className="w-32 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs"
                              />
                              <button
                                className="rounded bg-emerald-800 px-2 py-0.5 text-xs hover:bg-emerald-700"
                                title="Save forgiveness"
                              >
                                Save
                              </button>
                            </form>
                            {p.forgivenAt && (
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                {p.forgivenReason ?? "—"}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {eff}
                          </td>
                          <td className="px-2 py-2 text-right text-xs">
                            {released ? (
                              <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                                released
                              </span>
                            ) : (
                              <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                                pending
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {released ? (
                              <form action={unrelease}>
                                <button className="text-xs text-zinc-400 hover:text-zinc-200">
                                  Un-release
                                </button>
                              </form>
                            ) : (
                              <form action={release}>
                                <button className="rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600">
                                  Release
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
TSX

# ===========================================================================
# 9. Add a "Penalty pool" link on the admin season detail page (if it exists).
#    We tolerate not finding it — the URL works regardless.
# ===========================================================================
cat > outputs-tmp/patch-season-link.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx";
if (!fs.existsSync(FILE)) {
  console.log("(no admin season page, skipping link)");
  process.exit(0);
}
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("/penalty-pool")) {
  console.log("Season page: penalty pool link already present.");
  process.exit(0);
}
// Try to add a Link near the existing "Reports" admin link.
const reportsLink = /href={`\/admin\/leagues\/\${[^`]*}\/seasons\/\${[^`]*}\/reports`}/;
if (!reportsLink.test(s)) {
  console.log("Season page: no /reports link to anchor on, skipping.");
  process.exit(0);
}
// Append a "Penalty pool" link right after the closing </Link> of the reports link.
s = s.replace(
  /(<Link[^>]*href={`\/admin\/leagues\/\${[^`]*}\/seasons\/\${[^`]*}\/reports`}[^>]*>[^<]*<\/Link>)/,
  `$1
        <Link
          href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/penalty-pool\`}
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Penalty pool
        </Link>`
);
fs.writeFileSync(FILE, s);
console.log("Season page: penalty pool link added.");
EOF
node outputs-tmp/patch-season-link.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type-check + commit + push
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Penalty system: categories on decisions, deferred 'penalty pool' with forgive + release workflow, opt-in via deferPenaltyPoints flag on scoring system"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
