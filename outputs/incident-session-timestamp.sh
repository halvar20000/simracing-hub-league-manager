#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add RaceSession enum + 3 new fields on IncidentReport
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// 1a. Add RaceSession enum (idempotent).
if (!/^enum\s+RaceSession\s*{/m.test(s)) {
  s += `

enum RaceSession {
  QUALIFYING
  RACE
  RACE_1
  RACE_2
}
`;
  console.log("Added RaceSession enum.");
}

// 1b. Insert fields into IncidentReport model.
if (!s.includes("session")
    || !/session\s+RaceSession\?/.test(s)) {
  const lines = s.split("\n");
  let inModel = false;
  let insertLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+IncidentReport\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { insertLine = i; break; }
  }
  if (insertLine === -1) { console.error("IncidentReport closing brace not found."); process.exit(1); }

  // Avoid duplicates if already partially added.
  const newFields = [];
  if (!/^\s*session\s+RaceSession\?/m.test(s))   newFields.push("  session             RaceSession?");
  if (!/^\s*replayTimestamp\s+String\?/m.test(s)) newFields.push("  replayTimestamp     String?");
  if (!/^\s*outsideRaceIncident\s+Boolean/m.test(s)) newFields.push("  outsideRaceIncident Boolean @default(false)");

  if (newFields.length > 0) {
    lines.splice(insertLine, 0, ...newFields);
    s = lines.join("\n");
    console.log(`Inserted ${newFields.length} field(s) into IncidentReport.`);
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== Updated IncidentReport model ==="
awk '/^model IncidentReport/,/^}/' prisma/schema.prisma

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
echo ""
echo "=== Regenerate ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. New client component: SessionAndTimestampFields
# ===========================================================================
mkdir -p src/components
cat > src/components/SessionAndTimestampFields.tsx <<'TSX'
"use client";

import { useState } from "react";

export interface SessionOption {
  value: string;
  label: string;
}

export function SessionAndTimestampFields({
  sessionOptions,
}: {
  sessionOptions: SessionOption[];
}) {
  const [outside, setOutside] = useState(false);
  const required = !outside;

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          name="outsideRaceIncident"
          checked={outside}
          onChange={(e) => setOutside(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-orange-500"
        />
        <span>
          <span className="font-medium">Outside race incident</span>
          <span className="ml-1 text-xs text-zinc-500">
            (e.g. chat misconduct, off-track issues — session and timestamp not required)
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Session{required && <span className="ml-1 text-orange-400">*</span>}
          </span>
          <select
            name="session"
            required={required}
            disabled={outside}
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="" disabled>
              Select session…
            </option>
            {sessionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Replay timestamp{required && <span className="ml-1 text-orange-400">*</span>}
          </span>
          <input
            name="replayTimestamp"
            type="text"
            required={required}
            disabled={outside}
            placeholder="e.g. 1:23:45 or 12:30"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Stewards need this to find the incident in the replay.
          </span>
        </label>
      </div>
    </div>
  );
}
TSX
echo "[+] Wrote src/components/SessionAndTimestampFields.tsx"

# ===========================================================================
# 3. Patch the report form page: import + insert the new fields above lap/turn
# ===========================================================================
cat > outputs-tmp/patch-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 3a. Import.
if (!s.includes('SessionAndTimestampFields')) {
  s = s.replace(
    'import { protestWindowState, formatCountdown } from "@/lib/protest-window";',
    'import { protestWindowState, formatCountdown } from "@/lib/protest-window";\nimport { SessionAndTimestampFields } from "@/components/SessionAndTimestampFields";'
  );
}

// 3b. Compute sessionOptions just after the windowState block.
if (!s.includes("const sessionOptions")) {
  s = s.replace(
    'const windowBlocked = windowClosed || windowCooldown;',
    `const windowBlocked = windowClosed || windowCooldown;

  const racesPerRound = round.season.scoringSystem.racesPerRound ?? 1;
  const sessionOptions =
    racesPerRound > 1
      ? [
          { value: "QUALIFYING", label: "Qualifying" },
          { value: "RACE_1", label: "Heat 1 / Race 1" },
          { value: "RACE_2", label: "Feature / Race 2" },
        ]
      : [
          { value: "QUALIFYING", label: "Qualifying" },
          { value: "RACE", label: "Race" },
        ];`
  );
}

// 3c. Insert the new fields BLOCK just before the lap/turn grid.
const lapTurnAnchor = `        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Lap number (optional)
            </span>`;
const newBlock = `        <SessionAndTimestampFields sessionOptions={sessionOptions} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Lap number (optional)
            </span>`;
if (!s.includes("<SessionAndTimestampFields sessionOptions")) {
  if (!s.includes(lapTurnAnchor)) { console.error("Form: lap/turn anchor not found."); process.exit(1); }
  s = s.replace(lapTurnAnchor, newBlock);
}

fs.writeFileSync(FILE, s);
console.log("Form: SessionAndTimestampFields wired.");
EOF
node outputs-tmp/patch-form.mjs

# ===========================================================================
# 4. Server action: validate + save the new fields
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/incident-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// 4a. Import RaceSession from @prisma/client (extend the existing import).
if (!s.includes("RaceSession")) {
  s = s.replace(
    'import type { EvidenceKind } from "@prisma/client";',
    'import type { EvidenceKind, RaceSession } from "@prisma/client";'
  );
}

// 4b. Read + validate fields. Insert just after evidenceLinksRaw line.
if (!s.includes("outsideRaceIncident")) {
  s = s.replace(
    `  const evidenceLinksRaw = String(formData.get("evidenceLinks") ?? "").trim();`,
    `  const evidenceLinksRaw = String(formData.get("evidenceLinks") ?? "").trim();
  const outsideRaceIncident = formData.get("outsideRaceIncident") === "on";
  const sessionRaw = String(formData.get("session") ?? "").trim();
  const sessionValue = sessionRaw ? (sessionRaw as RaceSession) : null;
  const replayTimestamp =
    String(formData.get("replayTimestamp") ?? "").trim() || null;`
  );
}

// 4c. Add validation right above the description check.
if (!s.includes("Session+and+replay+timestamp")) {
  s = s.replace(
    `  if (!description) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/report?error=Description+is+required\`
    );
  }`,
    `  if (!outsideRaceIncident && (!sessionValue || !replayTimestamp)) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/report?error=Session+and+replay+timestamp+are+required\`
    );
  }
  if (!description) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}/report?error=Description+is+required\`
    );
  }`
  );
}

// 4d. Save the fields when creating the report.
if (!s.includes("session: sessionValue")) {
  s = s.replace(
    `      lapNumber,
      turnOrSector,
      description,
      status: "SUBMITTED",
      submittedAt: new Date(),`,
    `      lapNumber,
      turnOrSector,
      description,
      session: sessionValue,
      replayTimestamp,
      outsideRaceIncident,
      status: "SUBMITTED",
      submittedAt: new Date(),`
  );
}

fs.writeFileSync(FILE, s);
console.log("Action: session/timestamp/outside saved + validated.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 5. Report detail page: surface the new fields
# ===========================================================================
cat > outputs-tmp/patch-detail.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace the existing 2-column grid (Lap / Turn) with a 4-column block that
// also shows Session + Timestamp + outside flag.
const before = `      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Lap" value={report.lapNumber?.toString() ?? "—"} />
        <Field label="Turn / sector" value={report.turnOrSector ?? "—"} />
      </div>`;
const after = `      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Field
          label="Session"
          value={
            report.outsideRaceIncident
              ? "Outside race"
              : sessionLabel(report.session)
          }
        />
        <Field
          label="Replay timestamp"
          value={report.replayTimestamp ?? "—"}
        />
        <Field label="Lap" value={report.lapNumber?.toString() ?? "—"} />
        <Field label="Turn / sector" value={report.turnOrSector ?? "—"} />
      </div>`;
if (!s.includes("Replay timestamp")) {
  if (!s.includes(before)) { console.error("Detail: lap/turn grid anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

// Add a sessionLabel helper at the bottom of the file.
if (!s.includes("function sessionLabel(")) {
  s += `

function sessionLabel(s: string | null | undefined): string {
  if (!s) return "—";
  switch (s) {
    case "QUALIFYING": return "Qualifying";
    case "RACE":       return "Race";
    case "RACE_1":     return "Heat 1 / Race 1";
    case "RACE_2":     return "Feature / Race 2";
    default:           return s;
  }
}
`;
}

fs.writeFileSync(FILE, s);
console.log("Detail: session/timestamp display wired.");
EOF
node outputs-tmp/patch-detail.mjs

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
git commit -m "Reports: mandatory session + replay timestamp (with 'Outside race incident' override that disables the requirement)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
