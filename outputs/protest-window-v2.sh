#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ---------------------------------------------------------------------------
# 1. Schema patch using awk (model-aware, whitespace-insensitive)
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("protestWindowHours")) {
  console.log("Schema: protestWindowHours already present.");
  process.exit(0);
}

// Find the ScoringSystem model and insert before its closing brace.
const lines = s.split("\n");
let inModel = false;
let insertLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+ScoringSystem\s*{/.test(lines[i])) {
    inModel = true;
    continue;
  }
  if (inModel && /^}\s*$/.test(lines[i])) {
    insertLine = i;
    break;
  }
}
if (insertLine === -1) {
  console.error("Could not locate ScoringSystem model closing brace.");
  process.exit(1);
}

lines.splice(insertLine, 0, "  protestWindowHours          Int?");
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`Schema: inserted protestWindowHours at line ${insertLine + 1}.`);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== Updated ScoringSystem model ==="
awk '/^model ScoringSystem/,/^}/' prisma/schema.prisma

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

echo ""
echo "=== Verify protestWindowHours in generated client ==="
if grep -q 'protestWindowHours' node_modules/.prisma/client/index.d.ts; then
  echo "[OK] protestWindowHours present."
else
  echo "[FAIL] protestWindowHours not in generated client."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2-8: All the other patches from the previous script (unchanged).
# We only re-run the ones that haven't been applied yet — each is idempotent.
# ---------------------------------------------------------------------------

# Helper file
mkdir -p src/lib
cat > src/lib/protest-window.ts <<'TS'
export type ProtestWindowStatus = "OPEN" | "CLOSED" | "UNLIMITED";

export interface ProtestWindowState {
  status: ProtestWindowStatus;
  closesAt: Date | null;
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

# 3. Edit form
cat > outputs-tmp/patch-edit-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes('name="protestWindowHours"')) { console.log("Edit form: already done."); process.exit(0); }
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
if (!s.includes(before)) { console.error("Edit form: anchor not found."); process.exit(1); }
fs.writeFileSync(FILE, s.replace(before, insert));
console.log("Edit form: patched.");
EOF
node outputs-tmp/patch-edit-form.mjs

# 4. updateScoringSystem action
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");
if (!s.includes("protestWindowHours")) {
  const beforeRead = `  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));`;
  if (!s.includes(beforeRead)) { console.error("Action: read anchor not found."); process.exit(1); }
  s = s.replace(beforeRead, beforeRead + '\n  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));');
}
if (!s.includes("      protestWindowHours,")) {
  const beforeData = `      dropWorstNRounds,
      participationInCombined,
    },`;
  if (!s.includes(beforeData)) { console.error("Action: data anchor not found."); process.exit(1); }
  s = s.replace(beforeData, `      dropWorstNRounds,
      protestWindowHours,
      participationInCombined,
    },`);
}
fs.writeFileSync(FILE, s);
console.log("Action: patched.");
EOF
node outputs-tmp/patch-action.mjs

# 5. createIncidentReport
cat > outputs-tmp/patch-create-report.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/incident-reports.ts";
let s = fs.readFileSync(FILE, "utf8");
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import type { EvidenceKind } from "@prisma/client";',
    'import type { EvidenceKind } from "@prisma/client";\nimport { protestWindowState } from "@/lib/protest-window";'
  );
}
if (!s.includes("Reporting window check")) {
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
  if (!s.includes(beforeBlock)) { console.error("createIncidentReport: anchor not found."); process.exit(1); }
  s = s.replace(beforeBlock, afterBlock);
}
fs.writeFileSync(FILE, s);
console.log("createIncidentReport: patched.");
EOF
node outputs-tmp/patch-create-report.mjs

# 6. Round detail page
cat > outputs-tmp/patch-round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import { CopyLinkButton } from "@/components/CopyLinkButton";',
    'import { CopyLinkButton } from "@/components/CopyLinkButton";\nimport { protestWindowState, formatCountdown } from "@/lib/protest-window";'
  );
}
const before = `          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/report\`}
            className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
          >
            ⚑ Report incident
          </Link>`;
const after = `          <ReportButton
            href={\`/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/report\`}
            window={protestWindowState({
              raceStartsAt: round.startsAt,
              protestWindowHours: round.season.scoringSystem.protestWindowHours,
            })}
          />`;
if (s.includes("ReportButton")) {
  console.log("Round page: ReportButton already present.");
} else {
  if (!s.includes(before)) { console.error("Round page: report-button anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}
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

# 7. Report form page
cat > outputs-tmp/patch-report-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (!s.includes('from "@/lib/protest-window"')) {
  s = s.replace(
    'import { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";',
    'import { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";\nimport { protestWindowState, formatCountdown } from "@/lib/protest-window";'
  );
}
if (!s.includes("windowState")) {
  const beforeRound = `  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();`;
  const afterRound = `  const round = await prisma.round.findUnique({
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
  if (!s.includes(beforeRound)) { console.error("Report form: round anchor not found."); process.exit(1); }
  s = s.replace(beforeRound, afterRound);
}
if (!s.includes("Reporting window closes in")) {
  const beforeBanner = `      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}`;
  const afterBanner = `      {windowState.status === "OPEN" && windowState.minutesRemaining != null && (
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
  if (!s.includes(beforeBanner)) { console.error("Report form: error block anchor not found."); process.exit(1); }
  s = s.replace(beforeBanner, afterBanner);
}
if (!s.includes("disabled={windowClosed && !isSteward}")) {
  const beforeBtn = `          <button
            type="submit"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Submit report
          </button>`;
  const afterBtn = `          <button
            type="submit"
            disabled={windowClosed && !isSteward}
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit report
          </button>`;
  if (!s.includes(beforeBtn)) { console.error("Report form: submit anchor not found."); process.exit(1); }
  s = s.replace(beforeBtn, afterBtn);
}
fs.writeFileSync(FILE, s);
console.log("Report form: patched.");
EOF
node outputs-tmp/patch-report-form.mjs

# 8. /reports/new round picker
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
if (!s.includes("scoringSystem: { select: { protestWindowHours")) {
  const beforeQuery = `      season: {
        include: {
          league: true,
          rounds: {`;
  const afterQuery = `      season: {
        include: {
          league: true,
          scoringSystem: { select: { protestWindowHours: true } },
          rounds: {`;
  if (!s.includes(beforeQuery)) { console.error("/reports/new: season anchor not found."); process.exit(1); }
  s = s.replace(beforeQuery, afterQuery);
}
if (!s.includes('protestWindowState({')) {
  const beforeRow = `                    <li key={r.id}>
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
  const afterRow = `                    {(() => {
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
  if (!s.includes(beforeRow)) { console.error("/reports/new: row anchor not found."); process.exit(1); }
  s = s.replace(beforeRow, afterRow);
}
fs.writeFileSync(FILE, s);
console.log("/reports/new: patched.");
EOF
node outputs-tmp/patch-reports-new.mjs

rm -rf outputs-tmp

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
