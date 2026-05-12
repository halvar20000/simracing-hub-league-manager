#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add protestCooldownHours
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("protestCooldownHours")) {
  console.log("Schema: protestCooldownHours already present.");
  process.exit(0);
}
const lines = s.split("\n");
let inModel = false;
let insertLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+ScoringSystem\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { insertLine = i; break; }
}
if (insertLine === -1) { console.error("ScoringSystem model brace not found."); process.exit(1); }
lines.splice(insertLine, 0, "  protestCooldownHours       Int?");
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`Schema: inserted protestCooldownHours at line ${insertLine + 1}.`);
EOF
node outputs-tmp/patch-schema.mjs

echo ""
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

# ===========================================================================
# 2. Rewrite the helper to support cooldown + window
# ===========================================================================
cat > src/lib/protest-window.ts <<'TS'
export type ProtestWindowStatus = "COOLDOWN" | "OPEN" | "CLOSED" | "UNLIMITED";

export interface ProtestWindowState {
  status: ProtestWindowStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  /** When status === "COOLDOWN", minutes until the window opens. */
  minutesUntilOpen: number | null;
  /** When status === "OPEN" with a finite window, minutes left. */
  minutesRemaining: number | null;
  cooldownHours: number | null;
  windowHours: number | null;
}

/**
 * Reporting window timeline:
 *   raceStartsAt
 *     └── COOLDOWN (cooldownHours, optional) — no reports allowed
 *           └── OPEN (windowHours, optional) — reports allowed
 *                 └── CLOSED — no more reports
 *
 *   - Both null → UNLIMITED (always open).
 *   - Only cooldown set → cooldown then OPEN forever.
 *   - Only window set → OPEN immediately, then CLOSED.
 *   - Both set → cooldown then OPEN for N hours then CLOSED.
 */
export function protestWindowState(args: {
  raceStartsAt: Date;
  protestCooldownHours: number | null | undefined;
  protestWindowHours: number | null | undefined;
  now?: Date;
}): ProtestWindowState {
  const now = args.now ?? new Date();
  const cooldownHours = args.protestCooldownHours ?? null;
  const windowHours = args.protestWindowHours ?? null;

  if (cooldownHours == null && windowHours == null) {
    return {
      status: "UNLIMITED",
      opensAt: null,
      closesAt: null,
      minutesUntilOpen: null,
      minutesRemaining: null,
      cooldownHours: null,
      windowHours: null,
    };
  }

  const opensAt = new Date(
    args.raceStartsAt.getTime() + (cooldownHours ?? 0) * 60 * 60 * 1000
  );
  const closesAt =
    windowHours != null
      ? new Date(opensAt.getTime() + windowHours * 60 * 60 * 1000)
      : null;

  const minutesUntilOpen = Math.round((opensAt.getTime() - now.getTime()) / 60000);
  const minutesRemaining = closesAt
    ? Math.round((closesAt.getTime() - now.getTime()) / 60000)
    : null;

  if (minutesUntilOpen > 0) {
    return {
      status: "COOLDOWN",
      opensAt,
      closesAt,
      minutesUntilOpen,
      minutesRemaining: null,
      cooldownHours,
      windowHours,
    };
  }

  if (closesAt && minutesRemaining != null && minutesRemaining <= 0) {
    return {
      status: "CLOSED",
      opensAt,
      closesAt,
      minutesUntilOpen: null,
      minutesRemaining,
      cooldownHours,
      windowHours,
    };
  }

  return {
    status: "OPEN",
    opensAt,
    closesAt,
    minutesUntilOpen: null,
    minutesRemaining,
    cooldownHours,
    windowHours,
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

# ===========================================================================
# 3. Edit form: rename Reporting window section, add cooldown field
# ===========================================================================
cat > outputs-tmp/patch-edit-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace the existing Reporting window section block with a 2-field version.
const before = `        <Section title="Reporting window">
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
        </Section>`;

const after = `        <Section title="Reporting window">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field
              label="Cool-down after race start (hours, blank = open immediately)"
              name="protestCooldownHours"
              type="number"
              defaultValue={ss.protestCooldownHours != null ? String(ss.protestCooldownHours) : ""}
              min={0}
              max={720}
              placeholder="e.g. 12"
            />
            <Field
              label="Window length once open (hours, blank = no limit)"
              name="protestWindowHours"
              type="number"
              defaultValue={ss.protestWindowHours != null ? String(ss.protestWindowHours) : ""}
              min={1}
              max={720}
              placeholder="e.g. 48"
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Timeline after race start: <strong>cool-down</strong> (no reports) →
            <strong> window opens</strong> → <strong>window closes</strong>.
            Stewards/admins can always file (override).
          </p>
        </Section>`;

if (s.includes('name="protestCooldownHours"')) {
  console.log("Edit form: already has cooldown field.");
} else if (!s.includes(before)) {
  console.error("Edit form: previous Reporting window block not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Edit form: cooldown + window fields wired.");
}
EOF
node outputs-tmp/patch-edit-form.mjs

# ===========================================================================
# 4. updateScoringSystem action: persist protestCooldownHours
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

// 4a. Add the read line right after protestWindowHours (which already exists).
const beforeRead = `  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));`;
const afterRead = `  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));
  const protestCooldownHours = readIntOrNull(formData.get("protestCooldownHours"));`;
if (!s.includes("protestCooldownHours")) {
  if (!s.includes(beforeRead)) { console.error("Action: read anchor not found."); process.exit(1); }
  s = s.replace(beforeRead, afterRead);
}

// 4b. Add to data block.
const beforeData = `      protestWindowHours,
      participationInCombined,`;
const afterData = `      protestWindowHours,
      protestCooldownHours,
      participationInCombined,`;
if (!s.includes("      protestCooldownHours,")) {
  if (!s.includes(beforeData)) { console.error("Action: data anchor not found."); process.exit(1); }
  s = s.replace(beforeData, afterData);
}

fs.writeFileSync(FILE, s);
console.log("Action: cooldown wired.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 5. createIncidentReport: pass cooldown + reject on COOLDOWN/CLOSED
# ===========================================================================
cat > outputs-tmp/patch-create-report.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/incident-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// Update the protestWindowState call to include cooldown + replace the rejection.
const before = `  const window = protestWindowState({
    raceStartsAt: round.startsAt,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  if (window.status === "CLOSED" && !isSteward) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}?error=Reporting+window+is+closed\`
    );
  }`;

const after = `  const window = protestWindowState({
    raceStartsAt: round.startsAt,
    protestCooldownHours: round.season.scoringSystem.protestCooldownHours,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  if (!isSteward) {
    if (window.status === "COOLDOWN") {
      redirect(
        \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}?error=Reporting+window+has+not+opened+yet\`
      );
    }
    if (window.status === "CLOSED") {
      redirect(
        \`/leagues/\${leagueSlug}/seasons/\${seasonId}/rounds/\${roundId}?error=Reporting+window+is+closed\`
      );
    }
  }`;

if (s.includes("protestCooldownHours: round.season.scoringSystem.protestCooldownHours")) {
  console.log("createIncidentReport: cooldown already wired.");
} else if (!s.includes(before)) {
  console.error("createIncidentReport: window-check anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("createIncidentReport: cooldown wired.");
}
EOF
node outputs-tmp/patch-create-report.mjs

# ===========================================================================
# 6. Round detail page: pass cooldown + ReportButton handles COOLDOWN status
# ===========================================================================
cat > outputs-tmp/patch-round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Update the protestWindowState call to include cooldown
const before = `            window={protestWindowState({
              raceStartsAt: round.startsAt,
              protestWindowHours: round.season.scoringSystem.protestWindowHours,
            })}`;
const after = `            window={protestWindowState({
              raceStartsAt: round.startsAt,
              protestCooldownHours: round.season.scoringSystem.protestCooldownHours,
              protestWindowHours: round.season.scoringSystem.protestWindowHours,
            })}`;
if (!s.includes("protestCooldownHours: round.season.scoringSystem.protestCooldownHours")) {
  if (!s.includes(before)) { console.error("Round page: window call anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

// Replace the ReportButton component to handle COOLDOWN
const compBefore = `function ReportButton({
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
}`;

const compAfter = `function ReportButton({
  href,
  window: w,
}: {
  href: string;
  window: ReturnType<typeof protestWindowState>;
}) {
  if (w.status === "COOLDOWN" && w.minutesUntilOpen != null) {
    return (
      <span
        title={w.opensAt ? \`Window opens at \${w.opensAt.toLocaleString()}\` : "Cool-down"}
        className="cursor-not-allowed rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-400"
      >
        Reporting opens in {formatCountdown(w.minutesUntilOpen)}
      </span>
    );
  }
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
}`;
if (!s.includes("Reporting opens in")) {
  if (!s.includes(compBefore)) { console.error("Round page: ReportButton anchor not found."); process.exit(1); }
  s = s.replace(compBefore, compAfter);
}

fs.writeFileSync(FILE, s);
console.log("Round page: cooldown handling wired.");
EOF
node outputs-tmp/patch-round-page.mjs

# ===========================================================================
# 7. Report form page: pass cooldown + add COOLDOWN banner + disable button
# ===========================================================================
cat > outputs-tmp/patch-report-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Update windowState call + add windowNotOpen flag
const before = `  const windowState = protestWindowState({
    raceStartsAt: round.startsAt,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  const windowClosed = windowState.status === "CLOSED";`;
const after = `  const windowState = protestWindowState({
    raceStartsAt: round.startsAt,
    protestCooldownHours: round.season.scoringSystem.protestCooldownHours,
    protestWindowHours: round.season.scoringSystem.protestWindowHours,
  });
  const windowClosed = windowState.status === "CLOSED";
  const windowCooldown = windowState.status === "COOLDOWN";
  const windowBlocked = windowClosed || windowCooldown;`;
if (!s.includes("windowCooldown")) {
  if (!s.includes(before)) { console.error("Report form: windowState anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

// Add a COOLDOWN banner just before the existing windowClosed banner.
const bannerBefore = `      {windowClosed && (
        <div className="rounded border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">`;
const bannerAfter = `      {windowCooldown && windowState.minutesUntilOpen != null && (
        <div className="rounded border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">
          The reporting window opens in{" "}
          <strong>{formatCountdown(windowState.minutesUntilOpen)}</strong>
          {windowState.opensAt && (
            <span className="ml-1 text-xs text-zinc-500">
              (at {windowState.opensAt.toLocaleString()})
            </span>
          )}.
          {isSteward && " As a steward you can still file a report now."}
        </div>
      )}
      {windowClosed && (
        <div className="rounded border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-300">`;
if (!s.includes("The reporting window opens in")) {
  if (!s.includes(bannerBefore)) { console.error("Report form: closed-banner anchor not found."); process.exit(1); }
  s = s.replace(bannerBefore, bannerAfter);
}

// Update the submit button disabled condition: windowClosed → windowBlocked
const btnBefore = `disabled={windowClosed && !isSteward}`;
const btnAfter = `disabled={windowBlocked && !isSteward}`;
if (!s.includes("windowBlocked && !isSteward")) {
  if (!s.includes(btnBefore)) { console.error("Report form: submit-disabled anchor not found."); process.exit(1); }
  s = s.replace(btnBefore, btnAfter);
}

fs.writeFileSync(FILE, s);
console.log("Report form: cooldown banner + disabled wired.");
EOF
node outputs-tmp/patch-report-form.mjs

# ===========================================================================
# 8. /reports/new round picker: pass cooldown + show all 3 states
# ===========================================================================
cat > outputs-tmp/patch-reports-new.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/new/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add protestCooldownHours to the season select
const sBefore = `          scoringSystem: { select: { protestWindowHours: true } },`;
const sAfter = `          scoringSystem: { select: { protestCooldownHours: true, protestWindowHours: true } },`;
if (!s.includes("protestCooldownHours: true")) {
  if (!s.includes(sBefore)) { console.error("/reports/new: scoringSystem select anchor not found."); process.exit(1); }
  s = s.replace(sBefore, sAfter);
}

// Update the protestWindowState call inside the round map + add cooldown pill
const before = `                  {reg.season.rounds.map((r) => {
                    const w = protestWindowState({
                      raceStartsAt: r.startsAt,
                      protestWindowHours:
                        reg.season.scoringSystem.protestWindowHours,
                    });
                    const closed = w.status === "CLOSED";`;
const after = `                  {reg.season.rounds.map((r) => {
                    const w = protestWindowState({
                      raceStartsAt: r.startsAt,
                      protestCooldownHours:
                        reg.season.scoringSystem.protestCooldownHours,
                      protestWindowHours:
                        reg.season.scoringSystem.protestWindowHours,
                    });
                    const closed = w.status === "CLOSED";
                    const cooldown = w.status === "COOLDOWN";
                    const blocked = closed || cooldown;`;
if (!s.includes("const cooldown = w.status")) {
  if (!s.includes(before)) { console.error("/reports/new: map anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

// Replace the row pills:  green "closes in X" if open, grey "closed" if closed,
// and add a yellow "opens in X" if cooldown. Also dim the row when blocked.
const pillsBefore = `                          className={\`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 \${
                            closed ? "opacity-60" : ""
                          }\`}`;
const pillsAfter = `                          className={\`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 \${
                            blocked ? "opacity-60" : ""
                          }\`}`;
if (!s.includes("blocked ? \"opacity-60\" : \"\"")) {
  if (!s.includes(pillsBefore)) { console.error("/reports/new: row className anchor not found."); process.exit(1); }
  s = s.replace(pillsBefore, pillsAfter);
}

// Add cooldown pill — insert just before the "OPEN" pill
const pillBefore = `                              {w.status === "OPEN" && w.minutesRemaining != null && (
                                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                  closes in {formatCountdown(w.minutesRemaining)}
                                </span>
                              )}`;
const pillAfter = `                              {cooldown && w.minutesUntilOpen != null && (
                                <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200">
                                  opens in {formatCountdown(w.minutesUntilOpen)}
                                </span>
                              )}
                              {w.status === "OPEN" && w.minutesRemaining != null && (
                                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                  closes in {formatCountdown(w.minutesRemaining)}
                                </span>
                              )}`;
if (!s.includes('opens in {formatCountdown(w.minutesUntilOpen)}')) {
  if (!s.includes(pillBefore)) { console.error("/reports/new: open-pill anchor not found."); process.exit(1); }
  s = s.replace(pillBefore, pillAfter);
}

fs.writeFileSync(FILE, s);
console.log("/reports/new: cooldown pill wired.");
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
git commit -m "Reports: protest window with cool-down (cool-down → open → closed); two configurable hours fields per scoring system"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
