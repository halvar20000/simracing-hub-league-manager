#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ===========================================================================
# 1. Schema:  add WITHDRAWN to IncidentStatus enum
# ===========================================================================
mkdir -p outputs-tmp
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

const before = `enum IncidentStatus {
  SUBMITTED
  UNDER_REVIEW
  DECIDED
  DISMISSED
}`;
const after = `enum IncidentStatus {
  SUBMITTED
  UNDER_REVIEW
  DECIDED
  DISMISSED
  WITHDRAWN
}`;

if (s.includes("WITHDRAWN")) {
  console.log("Schema: WITHDRAWN already present.");
} else if (!s.includes(before)) {
  console.error("Schema: IncidentStatus anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Schema: added WITHDRAWN enum value.");
}
EOF
node outputs-tmp/patch-schema.mjs

# Push schema change to DB (adds enum value via ALTER TYPE) + regenerate client
echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
echo ""
echo "=== prisma generate ==="
npx --yes prisma generate

# ===========================================================================
# 2. New client component:  driver multi-select picker
# ===========================================================================
mkdir -p src/components
cat > src/components/InvolvedDriversPicker.tsx <<'TSX'
"use client";

import { useMemo, useState } from "react";

interface Driver {
  registrationId: string;
  startNumber: number | null;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
}

function flagFor(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const cps = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65
  );
  return String.fromCodePoint(...cps);
}

export function InvolvedDriversPicker({
  drivers,
  excludeRegistrationId,
  name = "involvedRegistrationIds",
}: {
  drivers: Driver[];
  excludeRegistrationId?: string;
  name?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => d.registrationId !== excludeRegistrationId)
      .filter((d) => {
        if (!q) return true;
        const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase();
        const num = d.startNumber != null ? String(d.startNumber) : "";
        return name.includes(q) || num.includes(q);
      })
      .sort((a, b) => {
        const an = a.startNumber ?? 9999;
        const bn = b.startNumber ?? 9999;
        if (an !== bn) return an - bn;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }, [drivers, query, excludeRegistrationId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search by name or start number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">No drivers match.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {visible.map((d) => {
              const isOn = selected.has(d.registrationId);
              return (
                <li key={d.registrationId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(d.registrationId)}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span className="w-10 text-right text-xs text-zinc-500">
                      {d.startNumber != null ? `#${d.startNumber}` : "—"}
                    </span>
                    <span className="text-base">{flagFor(d.countryCode)}</span>
                    <span className="flex-1 text-sm text-zinc-200">
                      {d.firstName} {d.lastName}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {selected.size} driver{selected.size === 1 ? "" : "s"} selected
        {selected.size > 0 && " — they will be tagged as ACCUSED on the report."}
      </p>
      {/* Hidden inputs carry the selection to the server action */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
TSX

# ===========================================================================
# 3. New component:  status timeline
# ===========================================================================
cat > src/components/StatusTimeline.tsx <<'TSX'
type Status = "SUBMITTED" | "UNDER_REVIEW" | "DECIDED" | "DISMISSED" | "WITHDRAWN";

const FLOW: Status[] = ["SUBMITTED", "UNDER_REVIEW", "DECIDED"];

export function StatusTimeline({ status }: { status: Status }) {
  // Branch end-states: DISMISSED and WITHDRAWN don't follow the linear path.
  if (status === "DISMISSED" || status === "WITHDRAWN") {
    const label =
      status === "DISMISSED" ? "Dismissed by stewards" : "Withdrawn by reporter";
    const tone =
      status === "DISMISSED"
        ? "border-zinc-700 bg-zinc-900 text-zinc-300"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
            Submitted
          </span>
          <span className="text-zinc-600">→</span>
          <span className={`rounded border px-2 py-0.5 ${tone}`}>{label}</span>
        </div>
      </div>
    );
  }

  const idx = FLOW.indexOf(status);
  return (
    <div className="flex items-center gap-2 text-xs">
      {FLOW.map((step, i) => {
        const reached = i <= idx;
        const styles = reached
          ? i === idx
            ? "border-orange-500 bg-orange-500/15 text-orange-200"
            : "border-emerald-700 bg-emerald-900/30 text-emerald-200"
          : "border-zinc-700 bg-zinc-900/40 text-zinc-500";
        const label =
          step === "SUBMITTED"
            ? "Submitted"
            : step === "UNDER_REVIEW"
            ? "Under review"
            : "Decided";
        return (
          <span key={step} className="flex items-center gap-2">
            <span className={`rounded border px-2 py-0.5 ${styles}`}>{label}</span>
            {i < FLOW.length - 1 && <span className="text-zinc-600">→</span>}
          </span>
        );
      })}
    </div>
  );
}
TSX

# ===========================================================================
# 4. Patch report form page — fetch roster + use the picker
# ===========================================================================
cat > outputs-tmp/patch-report-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Add the import
if (!s.includes('InvolvedDriversPicker')) {
  s = s.replace(
    'import { createIncidentReport } from "@/lib/actions/incident-reports";',
    'import { createIncidentReport } from "@/lib/actions/incident-reports";\nimport { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";'
  );
}

// 2. Insert roster fetch — right after reporterReg is loaded.
const beforeReg = `  const reporterReg = await prisma.registration.findFirst({
    where: {
      seasonId,
      userId: session.user.id,
      status: "APPROVED",
    },
    include: { user: true },
  });`;
const afterReg = `  const reporterReg = await prisma.registration.findFirst({
    where: {
      seasonId,
      userId: session.user.id,
      status: "APPROVED",
    },
    include: { user: true },
  });

  // Roster of approved drivers for the picker
  const roster = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          countryCode: true,
        },
      },
    },
    orderBy: [{ startNumber: "asc" }],
  });
  const driverChoices = roster.map((r) => ({
    registrationId: r.id,
    startNumber: r.startNumber,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    countryCode: r.user.countryCode,
  }));`;

if (!s.includes("Roster of approved drivers for the picker")) {
  if (!s.includes(beforeReg)) {
    console.error("Could not find reporterReg block in report form.");
    process.exit(1);
  }
  s = s.replace(beforeReg, afterReg);
}

// 3. Replace the free-text "Other driver(s) by start number" block with the picker
const freeText = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Other driver(s) by start number
          </span>
          <input
            name="involvedStartNumbers"
            type="text"
            placeholder="e.g. 26, 89"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Comma-separated. The system matches each number to a driver in the
            roster. You are automatically included as the reporter.
          </span>
        </label>`;
const picker = `        <div>
          <span className="mb-1 block text-sm text-zinc-300">
            Other driver(s) involved
          </span>
          <InvolvedDriversPicker
            drivers={driverChoices}
            excludeRegistrationId={reporterReg.id}
          />
        </div>`;

if (s.includes(freeText)) {
  s = s.replace(freeText, picker);
} else if (!s.includes("InvolvedDriversPicker drivers={")) {
  console.error("Could not find free-text driver block to replace.");
  process.exit(1);
}

fs.writeFileSync(FILE, s);
console.log("Report form: roster + picker wired in.");
EOF
node outputs-tmp/patch-report-form.mjs

# ===========================================================================
# 5. Patch incident-reports.ts:
#    - Accept involvedRegistrationIds[] (FormData.getAll) as primary source
#    - Keep numbers parser as fallback
#    - withdrawIncidentReport now sets status WITHDRAWN
# ===========================================================================
cat > outputs-tmp/patch-actions.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/incident-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// 1. Replace the involved-numbers block to also accept registration IDs.
const before = `  const involvedNumbersRaw = String(
    formData.get("involvedStartNumbers") ?? ""
  ).trim();`;
const after = `  const involvedNumbersRaw = String(
    formData.get("involvedStartNumbers") ?? ""
  ).trim();
  const involvedRegistrationIds = formData
    .getAll("involvedRegistrationIds")
    .map((v) => String(v).trim())
    .filter(Boolean);`;
if (!s.includes("involvedRegistrationIds")) {
  if (!s.includes(before)) {
    console.error("Cannot find involvedNumbersRaw declaration.");
    process.exit(1);
  }
  s = s.replace(before, after);
}

// 2. Insert "tag IDs as ACCUSED" block right after reporter is tagged.
const reporterTag = `  // Reporter is always tagged
  await prisma.incidentReportInvolvedDriver.create({
    data: {
      incidentReportId: report.id,
      registrationId: reporterReg.id,
      role: "REPORTER",
    },
  });`;
const reporterTagPlus = `  // Reporter is always tagged
  await prisma.incidentReportInvolvedDriver.create({
    data: {
      incidentReportId: report.id,
      registrationId: reporterReg.id,
      role: "REPORTER",
    },
  });

  // Tag drivers selected via the picker (preferred)
  for (const regId of involvedRegistrationIds) {
    if (regId === reporterReg.id) continue;
    const reg = await prisma.registration.findFirst({
      where: { id: regId, seasonId, status: "APPROVED" },
    });
    if (!reg) continue;
    await prisma.incidentReportInvolvedDriver
      .create({
        data: {
          incidentReportId: report.id,
          registrationId: reg.id,
          role: "ACCUSED",
        },
      })
      .catch(() => {
        /* duplicate */
      });
  }`;
if (!s.includes("Tag drivers selected via the picker")) {
  if (!s.includes(reporterTag)) {
    console.error("Cannot find reporter-tag block.");
    process.exit(1);
  }
  s = s.replace(reporterTag, reporterTagPlus);
}

// 3. Switch withdrawIncidentReport to use WITHDRAWN
const withdrawBefore = `  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "DISMISSED" },
  });`;
const withdrawAfter = `  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "WITHDRAWN" },
  });`;
if (s.includes(withdrawBefore)) {
  s = s.replace(withdrawBefore, withdrawAfter);
}

fs.writeFileSync(FILE, s);
console.log("Actions: registration-id support + WITHDRAWN status wired.");
EOF
node outputs-tmp/patch-actions.mjs

# ===========================================================================
# 6. New /reports/new page — round picker
# ===========================================================================
mkdir -p 'src/app/reports/new'
cat > 'src/app/reports/new/page.tsx' <<'TSX'
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function NewReportPicker() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/reports/new");

  // All seasons the user is approved in
  const myRegs = await prisma.registration.findMany({
    where: { userId: session.user.id, status: "APPROVED" },
    include: {
      season: {
        include: {
          league: true,
          rounds: {
            orderBy: { roundNumber: "asc" },
            select: {
              id: true,
              roundNumber: true,
              name: true,
              track: true,
              startsAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← My reports
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold">
            New incident report
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pick the round you want to report against.
          </p>
        </div>
      </div>

      {myRegs.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          You are not registered in any active season, so you cannot file a
          report yet.
        </p>
      ) : (
        <div className="space-y-6">
          {myRegs.map((reg) => (
            <section
              key={reg.id}
              className="rounded border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <header className="mb-3">
                <h2 className="font-display text-lg font-bold">
                  {reg.season.league.name}
                </h2>
                <p className="text-sm text-zinc-400">{reg.season.name}</p>
              </header>
              {reg.season.rounds.length === 0 ? (
                <p className="text-sm text-zinc-500">No rounds yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {reg.season.rounds.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/leagues/${reg.season.league.slug}/seasons/${reg.season.id}/rounds/${r.id}/report`}
                        className="flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900"
                      >
                        <span className="flex items-center gap-3">
                          <span className="w-10 text-right text-zinc-500">
                            R{r.roundNumber}
                          </span>
                          <span className="font-medium text-zinc-200">
                            {r.name}
                          </span>
                          {r.track && (
                            <span className="text-zinc-500">— {r.track}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500">
                            {formatDateTime(r.startsAt)}
                          </span>
                          <span className="text-orange-400">Report →</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
TSX

# ===========================================================================
# 7. Patch /reports list — add "+ New report" button + WITHDRAWN badge
# ===========================================================================
cat > outputs-tmp/patch-reports-list.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add WITHDRAWN style to badges
const badgeBefore = `    DISMISSED: "bg-zinc-800 text-zinc-400",
  };`;
const badgeAfter = `    DISMISSED: "bg-zinc-800 text-zinc-400",
    WITHDRAWN: "bg-zinc-800 text-zinc-500",
  };`;
if (!s.includes('WITHDRAWN: "bg-zinc-800')) {
  s = s.replace(badgeBefore, badgeAfter);
}

// Replace "How do I file" details with "+ New report" button
const detailsBefore = `        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200">
            How do I file a new report?
          </summary>
          <p className="mt-2 max-w-md text-zinc-400">
            Open the round you want to report against (Leagues → season →
            round) and click the orange{" "}
            <span className="font-semibold text-orange-200">
              ⚑ Report incident
            </span>{" "}
            button next to the share icon.
          </p>
        </details>`;
const newButton = `        <a
          href="/reports/new"
          className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
        >
          + New report
        </a>`;
if (s.includes(detailsBefore)) {
  s = s.replace(detailsBefore, newButton);
}

fs.writeFileSync(FILE, s);
console.log("/reports list: + New report button + WITHDRAWN badge.");
EOF
node outputs-tmp/patch-reports-list.mjs

# ===========================================================================
# 8. Patch report detail page — add status timeline + WITHDRAWN badge
# ===========================================================================
cat > outputs-tmp/patch-report-detail.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add import
if (!s.includes("StatusTimeline")) {
  s = s.replace(
    'import { formatDateTime } from "@/lib/date";',
    'import { formatDateTime } from "@/lib/date";\nimport { StatusTimeline } from "@/components/StatusTimeline";'
  );
}

// Replace the single StatusBadge usage in the header with badge + timeline
const before = `        <div className="mt-2">
          <StatusBadge status={report.status} />
        </div>`;
const after = `        <div className="mt-3 space-y-2">
          <StatusBadge status={report.status} />
          <StatusTimeline status={report.status as any} />
        </div>`;
if (s.includes(before) && !s.includes("StatusTimeline status={")) {
  s = s.replace(before, after);
}

// Add WITHDRAWN style
const badgeBefore = `    DISMISSED: "bg-zinc-800 text-zinc-400",
  };`;
const badgeAfter = `    DISMISSED: "bg-zinc-800 text-zinc-400",
    WITHDRAWN: "bg-zinc-800 text-zinc-500",
  };`;
if (!s.includes('WITHDRAWN: "bg-zinc-800')) {
  s = s.replace(badgeBefore, badgeAfter);
}

fs.writeFileSync(FILE, s);
console.log("Report detail: timeline + WITHDRAWN badge.");
EOF
node outputs-tmp/patch-report-detail.mjs

# ===========================================================================
# 9. Patch admin queue — add WITHDRAWN to badge + counts
# ===========================================================================
cat > outputs-tmp/patch-admin-queue.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const countsBefore = `  const counts = {
    submitted: reports.filter((r) => r.status === "SUBMITTED").length,
    review: reports.filter((r) => r.status === "UNDER_REVIEW").length,
    decided: reports.filter((r) => r.status === "DECIDED").length,
    dismissed: reports.filter((r) => r.status === "DISMISSED").length,
  };`;
const countsAfter = `  const counts = {
    submitted: reports.filter((r) => r.status === "SUBMITTED").length,
    review: reports.filter((r) => r.status === "UNDER_REVIEW").length,
    decided: reports.filter((r) => r.status === "DECIDED").length,
    dismissed: reports.filter((r) => r.status === "DISMISSED").length,
    withdrawn: reports.filter((r) => r.status === "WITHDRAWN").length,
  };`;
if (s.includes(countsBefore)) {
  s = s.replace(countsBefore, countsAfter);
}

const summaryBefore = `          {reports.length} total — {counts.submitted} new, {counts.review}{" "}
          under review, {counts.decided} decided, {counts.dismissed} dismissed`;
const summaryAfter = `          {reports.length} total — {counts.submitted} new, {counts.review}{" "}
          under review, {counts.decided} decided, {counts.dismissed} dismissed, {counts.withdrawn} withdrawn`;
if (s.includes(summaryBefore)) {
  s = s.replace(summaryBefore, summaryAfter);
}

const badgeBefore = `    DISMISSED: "bg-zinc-800 text-zinc-400",
  };`;
const badgeAfter = `    DISMISSED: "bg-zinc-800 text-zinc-400",
    WITHDRAWN: "bg-zinc-800 text-zinc-500",
  };`;
if (!s.includes('WITHDRAWN: "bg-zinc-800')) {
  s = s.replace(badgeBefore, badgeAfter);
}

fs.writeFileSync(FILE, s);
console.log("Admin queue: WITHDRAWN counts + badge.");
EOF
node outputs-tmp/patch-admin-queue.mjs

# ===========================================================================
# 10. Patch nav — steward badge with SUBMITTED count
# ===========================================================================
cat > outputs-tmp/patch-nav.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/nav.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = `  let isAdmin = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    isAdmin = user?.role === "ADMIN" || user?.role === "STEWARD";
  }`;
const after = `  let isAdmin = false;
  let pendingReports = 0;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    isAdmin = user?.role === "ADMIN" || user?.role === "STEWARD";
    if (isAdmin) {
      pendingReports = await prisma.incidentReport.count({
        where: { status: "SUBMITTED" },
      });
    }
  }`;
if (s.includes("pendingReports")) {
  console.log("Nav: pendingReports already wired.");
} else if (!s.includes(before)) {
  console.error("Nav: anchor for pendingReports not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
}

const adminLinkBefore = `          {isAdmin && <NavLink href="/admin">Admin</NavLink>}`;
const adminLinkAfter = `          {isAdmin && (
            <NavLink href="/admin">
              Admin
              {pendingReports > 0 && (
                <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-orange-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
                  {pendingReports}
                </span>
              )}
            </NavLink>
          )}`;
if (!s.includes("inline-block min-w-[1.25rem] rounded-full bg-orange-500")) {
  if (!s.includes(adminLinkBefore)) {
    console.error("Nav: admin link anchor not found.");
    process.exit(1);
  }
  s = s.replace(adminLinkBefore, adminLinkAfter);
}

fs.writeFileSync(FILE, s);
console.log("Nav: steward badge wired.");
EOF
node outputs-tmp/patch-nav.mjs

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
git commit -m "Reports overhaul: driver picker, /reports/new round picker, WITHDRAWN status, status timeline, steward nav badge"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
