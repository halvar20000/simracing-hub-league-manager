#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add protestWindowHours to ScoringSystem
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("protestWindowHours")) {
  console.log("Schema: protestWindowHours already present.");
} else {
  // Insert just before pointsTableRace2 in the ScoringSystem model.
  const before = `  participationInCombined Boolean  @default(true)
  racesPerRound           Int      @default(1)
  pointsTableRace2        Json?
}`;
  const after = `  participationInCombined Boolean  @default(true)
  racesPerRound           Int      @default(1)
  pointsTableRace2        Json?
  protestWindowHours      Int?
}`;
  if (!s.includes(before)) {
    console.error("ScoringSystem anchor not found.");
    process.exit(1);
  }
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Schema: added protestWindowHours.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate

echo ""
echo "=== Clearing caches ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund

echo ""
echo "=== prisma generate ==="
npx --yes prisma generate

# ===========================================================================
# 2. Helper: src/lib/protest-window.ts
# ===========================================================================
mkdir -p src/lib
cat > src/lib/protest-window.ts <<'TS'
export type ProtestWindowStatus = "OPEN" | "CLOSED" | "UNLIMITED";

export interface ProtestWindowState {
  status: ProtestWindowStatus;
  closesAt: Date | null;
  /**
   * Minutes remaining until the window closes.
   * Null when status is UNLIMITED, negative when status is CLOSED.
   */
  minutesRemaining: number | null;
  windowHours: number | null;
}

export function protestWindowState(args: {
  raceStartsAt: Date;
  protestWindowHours: number | null | undefined;
  now?: Date;
}): ProtestWindowState {
  const now = args.now ?? new Date();
  const hours = args.protestWindowHours ?? null;

  if (hours == null) {
    return { status: "UNLIMITED", closesAt: null, minutesRemaining: null, windowHours: null };
  }

  const closesAt = new Date(args.raceStartsAt.getTime() + hours * 60 * 60 * 1000);
  const minutesRemaining = Math.round((closesAt.getTime() - now.getTime()) / 60000);

  return {
    status: minutesRemaining > 0 ? "OPEN" : "CLOSED",
    closesAt,
    minutesRemaining,
    windowHours: hours,
  };
}

/** Human-readable countdown like "14h 23m" or "3d 4h" */
export function formatCountdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
}
TS
echo "[+] Wrote src/lib/protest-window.ts"

# ===========================================================================
# 3. Edit form: add "Reporting window" section
# ===========================================================================
cat > outputs-tmp/patch-edit-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = `        <Section title="Drop weeks">`;
const insert = `        <Section title="Reporting window">
          <Field
            label="Protest window after race start (hours, blank = no limit)"
            name="protestWindowHours"
            type="number"
            defaultValue={ss.protestWindowHours != null ? String(ss.protestWindowHours) : ""}
            min={1}
            max={720}
            placeholder="e.g. 24, 48, 72"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Drivers can file an incident report from race start until this many
            hours later. Stewards/admins can always file (override).
          </p>
        </Section>

        <Section title="Drop weeks">`;

if (s.includes('name="protestWindowHours"')) {
  console.log("Edit form: protestWindowHours field already present.");
} else if (!s.includes(before)) {
  console.error("Edit form: 'Drop weeks' anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, insert);
  fs.writeFileSync(FILE, s);
  console.log("Edit form: added Reporting window section.");
}
EOF
node outputs-tmp/patch-edit-form.mjs

# ===========================================================================
# 4. updateScoringSystem action: persist protestWindowHours
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

// 4a. Add the read line right after dropWorstNRounds.
const beforeRead = `  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));`;
const afterRead = `  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));
  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));`;
if (!s.includes("protestWindowHours")) {
  if (!s.includes(beforeRead)) {
    console.error("Action: dropWorstNRounds read anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeRead, afterRead);
}

// 4b. Add the field to the prisma update data block.
const beforeData = `      dropWorstNRounds,
      participationInCombined,
    },`;
const afterData = `      dropWorstNRounds,
      protestWindowHours,
      participationInCombined,
    },`;
if (!s.includes("      protestWindowHours,")) {
  if (!s.includes(beforeData)) {
    console.error("Action: data block anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeData, afterData);
}

fs.writeFileSync(FILE, s);
console.log("Action: protestWindowHours wired.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 5. createIncidentReport: enforce the window (steward override)
# ===========================================================================
cat > outputs-tmp/patch-create-report.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/incident-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// 5a. Import the helper if not yet.
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import type { EvidenceKind } from "@prisma/client";',
    'import type { EvidenceKind } from "@prisma/client";\nimport { protestWindowState } from "@/lib/protest-window";'
  );
}

// 5b. Replace the simple round lookup with one that includes the scoring system,
//     then add the window check + steward override right after the round check.
const beforeBlock = `  const round = await prisma.round.findFirst({
    where: { id: roundId, seasonId },
  });
  if (!round) {
    redirect(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
  }`;
const afterBlock = `  const round = await prisma.round.findFirst({
    where: { id: roundId, seasonId },
    include: { season: { include: { scoringSystem: true } } },
  });
  if (!round) {
    redirect(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
  }

  // Reporting window check — admins/stewards bypass.
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true },
  });
  const isSteward = me?.role === "ADMIN" || me?.role === "STEWARD";
  const window = protestWindowState({
    raceStartsAt: round.startsAt,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  if (window.status === "CLOSED" && !isSteward) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}?error=Reporting+window+is+closed\`
    );
  }`;
if (s.includes("Reporting window check")) {
  console.log("createIncidentReport: window check already present.");
} else if (!s.includes(beforeBlock)) {
  console.error("createIncidentReport: round-lookup anchor not found.");
  process.exit(1);
} else {
  s = s.replace(beforeBlock, afterBlock);
}

fs.writeFileSync(FILE, s);
console.log("createIncidentReport: window enforcement wired.");
EOF
node outputs-tmp/patch-create-report.mjs

# ===========================================================================
# 6. Round detail page: surface the window state in the report button
# ===========================================================================
cat > outputs-tmp/patch-round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add import
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import { CopyLinkButton } from "@/components/CopyLinkButton";',
    'import { CopyLinkButton } from "@/components/CopyLinkButton";\nimport { protestWindowState, formatCountdown } from "@/lib/protest-window";'
  );
}

// Replace the static report button with a window-aware one.
const before =
`          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/report\`}
            className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
          >
            ⚑ Report incident
          </Link>`;
const after =
`          <ReportButton
            href={\`/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/report\`}
            window={protestWindowState({
              raceStartsAt: round.startsAt,
              protestWindowHours: round.season.scoringSystem.protestWindowHours,
            })}
          />`;
if (s.includes("ReportButton")) {
  console.log("Round page: ReportButton already present.");
} else if (!s.includes(before)) {
  console.error("Round page: report-button anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
}

// Append helper component at the bottom of the file (only once).
if (!s.includes("function ReportButton(")) {
  s += `

function ReportButton({
  href,
  window: w,
}: {
  href: string;
  window: ReturnType<typeof protestWindowState>;
}) {
  if (w.status === "CLOSED") {
    return (
      <span
        title={w.closesAt ? \`Window closed at \${w.closesAt.toLocaleString()}\` : "Closed"}
        className="cursor-not-allowed rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-500"
      >
        Reporting closed
      </span>
    );
  }
  if (w.status === "OPEN" && w.minutesRemaining != null) {
    return (
      <a
        href={href}
        className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
      >
        ⚑ Report incident
        <span className="ml-1 text-xs text-orange-300/80">
          · closes in {formatCountdown(w.minutesRemaining)}
        </span>
      </a>
    );
  }
  // UNLIMITED
  return (
    <a
      href={href}
      className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
    >
      ⚑ Report incident
    </a>
  );
}
`;
  console.log("Round page: appended ReportButton component.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-round-page.mjs

# ===========================================================================
# 7. Report form page: banner + steward override notice
# ===========================================================================
cat > outputs-tmp/patch-report-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add imports
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";',
    'import { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";\nimport { protestWindowState, formatCountdown } from "@/lib/protest-window";'
  );
}

// Replace the round.findUnique to also load the scoringSystem; add window calc + role lookup.
const beforeRound =
`  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();`;
const afterRound =
`  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true, scoringSystem: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isSteward = me?.role === "ADMIN" || me?.role === "STEWARD";
  const windowState = protestWindowState({
    raceStartsAt: round.startsAt,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  const windowClosed = windowState.status === "CLOSED";`;
if (!s.includes("windowState")) {
  if (!s.includes(beforeRound)) {
    console.error("Report form: round-lookup anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeRound, afterRound);
}

// Add the banner just under the page heading wrapper (before the {error && ...} block).
const beforeBanner =
`      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}`;
const afterBanner =
`      {windowState.status === "OPEN" && windowState.minutesRemaining != null && (
        <div className="rounded border border-orange-700/60 bg-orange-950/30 p-3 text-sm text-orange-200">
          Reporting window closes in <strong>{formatCountdown(windowState.minutesRemaining)}</strong>
          {windowState.closesAt && (
            <span className="ml-1 text-xs text-orange-300/70">
              (at {windowState.closesAt.toLocaleString()})
            </span>
          )}
        </div>
      )}
      {windowClosed && (
        <div className="rounded border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">
          The reporting window for this round closed on{" "}
          {windowState.closesAt?.toLocaleString()}.
          {isSteward
            ? " As a steward you can still file a report for the record."
            : " Please contact a steward if you have a late report."}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}`;
if (!s.includes("Reporting window closes in")) {
  if (!s.includes(beforeBanner)) {
    console.error("Report form: error-block anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeBanner, afterBanner);
}

// Disable the form submit if window closed and not a steward.
const beforeBtn =
`          <button
            type="submit"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Submit report
          </button>`;
const afterBtn =
`          <button
            type="submit"
            disabled={windowClosed && !isSteward}
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit report
          </button>`;
if (!s.includes("disabled={windowClosed && !isSteward}")) {
  if (!s.includes(beforeBtn)) {
    console.error("Report form: submit button anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeBtn, afterBtn);
}

fs.writeFileSync(FILE, s);
console.log("Report form: banner + disabled state wired.");
EOF
node outputs-tmp/patch-report-form.mjs

# ===========================================================================
# 8. /reports/new round picker: show window state per round
# ===========================================================================
cat > outputs-tmp/patch-reports-new.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/new/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import { formatDateTime } from "@/lib/date";',
    'import { formatDateTime } from "@/lib/date";\nimport { protestWindowState, formatCountdown } from "@/lib/protest-window";'
  );
}

// Include scoringSystem in the season fetch.
const beforeQuery = `      season: {
        include: {
          league: true,
          rounds: {`;
const afterQuery = `      season: {
        include: {
          league: true,
          scoringSystem: { select: { protestWindowHours: true } },
          rounds: {`;
if (!s.includes("scoringSystem: { select: { protestWindowHours")) {
  if (!s.includes(beforeQuery)) {
    console.error("/reports/new: season include anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeQuery, afterQuery);
}

// Replace the round Link block with one that shows window status.
const beforeRow =
`                    <li key={r.id}>
                      <Link
                        href={\`/leagues/\${reg.season.league.slug}/seasons/\${reg.season.id}/rounds/\${r.id}/report\`}
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
                    </li>`;
const afterRow =
`                    {(() => {
                      const w = protestWindowState({
                        raceStartsAt: r.startsAt,
                        protestWindowHours:
                          reg.season.scoringSystem.protestWindowHours,
                      });
                      const closed = w.status === "CLOSED";
                      return (
                        <li key={r.id}>
                          <Link
                            href={\`/leagues/\${reg.season.league.slug}/seasons/\${reg.season.id}/rounds/\${r.id}/report\`}
                            className={\`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 \${
                              closed ? "opacity-60" : ""
                            }\`}
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
                              {w.status === "OPEN" && w.minutesRemaining != null && (
                                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                  closes in {formatCountdown(w.minutesRemaining)}
                                </span>
                              )}
                              {closed && (
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                  closed
                                </span>
                              )}
                              <span className="text-orange-400">Report →</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })()}`;
if (!s.includes('protestWindowState({')) {
  if (!s.includes(beforeRow)) {
    console.error("/reports/new: round row anchor not found.");
    process.exit(1);
  }
  s = s.replace(beforeRow, afterRow);
}

fs.writeFileSync(FILE, s);
console.log("/reports/new: window indicators wired.");
EOF
node outputs-tmp/patch-reports-new.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type-check + commit
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Reports: protest window per scoring system (open at race start, configurable hours, steward override)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
