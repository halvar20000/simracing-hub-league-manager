#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create the client component for the category dropdown + live points
# ============================================================================
echo "=== 1. Write src/components/CategoryLevelSelect.tsx ==="
mkdir -p src/components
cat > src/components/CategoryLevelSelect.tsx <<'TSX'
"use client";

import { useState } from "react";
import {
  PENALTY_LEVELS,
  PENALTY_LEVEL_LABEL,
} from "@/lib/penalty-categories";

export function CategoryLevelSelect({
  initialLevel,
  pointsTable,
  name = "categoryLevel",
}: {
  initialLevel: string;
  pointsTable: Record<string, number>;
  name?: string;
}) {
  const [level, setLevel] = useState<string>(initialLevel);
  const pts = level === "" ? null : pointsTable[level] ?? 0;

  return (
    <>
      <select
        name={name}
        value={level}
        onChange={(e) => setLevel(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      >
        <option value="">— (no category)</option>
        {PENALTY_LEVELS.map((lv) => (
          <option key={lv} value={String(lv)}>
            {PENALTY_LEVEL_LABEL[lv]} — {pointsTable[String(lv)] ?? 0} pts
          </option>
        ))}
      </select>
      {pts != null && pts > 0 && (
        <div className="mt-2 rounded border border-amber-900/60 bg-amber-900/30 px-3 py-1.5 text-sm">
          <span className="text-zinc-400">Will deduct:</span>{" "}
          <strong className="text-lg text-amber-200">{pts}</strong>{" "}
          <span className="text-amber-200">
            penalty point{pts === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {pts === 0 && level !== "" && (
        <div className="mt-2 rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400">
          Warning category — no penalty points deducted.
        </div>
      )}
    </>
  );
}
TSX
echo "  Wrote src/components/CategoryLevelSelect.tsx"

# ============================================================================
# 2. Patch the report page
# ============================================================================
echo ""
echo "=== 2. Patch admin report page ==="
mkdir -p scripts
cat > scripts/lm_patch_report_page.cjs <<'JS'
const fs = require("fs");
const FILE =
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// 2a. Add import for CategoryLevelSelect (just after the SubmitWithSpinner import)
if (!s.includes("CategoryLevelSelect")) {
  s = s.replace(
    /import \{ SubmitWithSpinner \} from "@\/components\/SubmitWithSpinner";\n/,
    'import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";\nimport { CategoryLevelSelect } from "@/components/CategoryLevelSelect";\n'
  );
}

// 2b. Insert "When & Where" info block right BEFORE the 2-column grid section.
//     Anchor: `<section className="grid gap-4 md:grid-cols-2">`
const WHEN_WHERE_BLOCK = [
  '      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">',
  '        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">',
  '          <div>',
  '            <span className="text-[10px] uppercase tracking-widest text-zinc-500">',
  '              Replay timestamp',
  '            </span>',
  '            <div className="font-mono text-2xl font-bold text-amber-200">',
  '              {report.replayTimestamp ?? "—"}',
  '            </div>',
  '          </div>',
  '          <div>',
  '            <span className="text-[10px] uppercase tracking-widest text-zinc-500">',
  '              Session',
  '            </span>',
  '            <div className="text-base text-zinc-200">',
  '              {report.session ?? "—"}',
  '            </div>',
  '          </div>',
  '          <div>',
  '            <span className="text-[10px] uppercase tracking-widest text-zinc-500">',
  '              Lap',
  '            </span>',
  '            <div className="text-base text-zinc-200">',
  '              {report.lapNumber ?? "—"}',
  '            </div>',
  '          </div>',
  '          <div>',
  '            <span className="text-[10px] uppercase tracking-widest text-zinc-500">',
  '              Turn / Sector',
  '            </span>',
  '            <div className="text-base text-zinc-200">',
  '              {report.turnOrSector ?? "—"}',
  '            </div>',
  '          </div>',
  '        </div>',
  '      </section>',
  '',
  '      <section className="grid gap-4 md:grid-cols-2">',
].join("\n");

const gridAnchor = '      <section className="grid gap-4 md:grid-cols-2">';
if (!s.includes("Replay timestamp")) {
  if (!s.includes(gridAnchor)) {
    console.error("  Could not find the grid section anchor. Printing area:");
    const idx = s.indexOf("md:grid-cols-2");
    console.error(s.slice(Math.max(0, idx - 100), idx + 200));
    process.exit(1);
  }
  s = s.replace(gridAnchor, WHEN_WHERE_BLOCK);
}

// 2c. Replace the categoryLevel <select>...</select> block with the new component.
const SELECT_ANCHOR =
  '            <select\n' +
  '              name="categoryLevel"\n' +
  '              defaultValue={\n' +
  '                report.decision?.penalties?.[0]?.categoryLevel != null\n' +
  '                  ? String(report.decision.penalties[0].categoryLevel)\n' +
  '                  : ""\n' +
  '              }\n' +
  '              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"\n' +
  '            >\n' +
  '              <option value="">— (no category)</option>\n' +
  '              {PENALTY_LEVELS.map((lv) => (\n' +
  '                <option key={lv} value={String(lv)}>\n' +
  '                  {PENALTY_LEVEL_LABEL[lv]} — {categoryPointsTable[String(lv)] ?? 0} pts\n' +
  '                </option>\n' +
  '              ))}\n' +
  '            </select>';

const SELECT_REPLACEMENT =
  '            <CategoryLevelSelect\n' +
  '              initialLevel={\n' +
  '                report.decision?.penalties?.[0]?.categoryLevel != null\n' +
  '                  ? String(report.decision.penalties[0].categoryLevel)\n' +
  '                  : ""\n' +
  '              }\n' +
  '              pointsTable={categoryPointsTable}\n' +
  '            />';

if (!s.includes("CategoryLevelSelect\n              initialLevel")) {
  if (!s.includes(SELECT_ANCHOR)) {
    console.error("  Category-level <select> anchor not found. Aborting.");
    process.exit(1);
  }
  s = s.replace(SELECT_ANCHOR, SELECT_REPLACEMENT);
}

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
JS

node scripts/lm_patch_report_page.cjs

echo ""
echo "-- Verify --"
F='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'
grep -nE 'CategoryLevelSelect|Replay timestamp|replayTimestamp' "$F" | head -10

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Steward review: show replay timestamp + session + lap + turn at top. Penalty category dropdown is now a client component with live 'Will deduct N points' indicator."
git push

echo ""
echo "Done."
