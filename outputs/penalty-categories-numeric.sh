#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: add categoryLevel (Int) on Penalty + categoryPointsTable on ScoringSystem
#    NB: leaving the existing PenaltyCategory enum field on Penalty alone for
#    safety. The new categoryLevel becomes the source of truth for points.
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

// Penalty.categoryLevel
{
  const lines = s.split("\n");
  let inModel = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+Penalty\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("Penalty model brace not found."); process.exit(1); }
  if (!/^\s*categoryLevel\s+Int\?/m.test(s)) {
    lines.splice(close, 0, "  categoryLevel   Int?");
    s = lines.join("\n");
    console.log("Penalty: added categoryLevel.");
  }
}

// ScoringSystem.categoryPointsTable
{
  const lines = s.split("\n");
  let inModel = false, close = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^model\s+ScoringSystem\s*{/.test(lines[i])) { inModel = true; continue; }
    if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
  }
  if (close === -1) { console.error("ScoringSystem brace not found."); process.exit(1); }
  if (!/^\s*categoryPointsTable\s+Json\?/m.test(s)) {
    lines.splice(close, 0, "  categoryPointsTable      Json?");
    s = lines.join("\n");
    console.log("ScoringSystem: added categoryPointsTable.");
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
# 2. Helper: src/lib/penalty-categories.ts — labels + table reader
# ===========================================================================
mkdir -p src/lib
cat > src/lib/penalty-categories.ts <<'TS'
export const PENALTY_LEVELS = [0, 1, 2, 3] as const;
export type PenaltyLevel = (typeof PENALTY_LEVELS)[number];

export const PENALTY_LEVEL_LABEL: Record<number, string> = {
  0: "Category 0 — Warning",
  1: "Category 1",
  2: "Category 2",
  3: "Category 3",
};

export const DEFAULT_CATEGORY_POINTS: Record<string, number> = {
  "0": 0,
  "1": 2,
  "2": 4,
  "3": 8,
};

/** Read the category→points map from a ScoringSystem.categoryPointsTable JSON. */
export function readCategoryPoints(
  raw: unknown
): Record<string, number> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CATEGORY_POINTS };
  const out: Record<string, number> = { ...DEFAULT_CATEGORY_POINTS };
  for (const lv of PENALTY_LEVELS) {
    const key = String(lv);
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[key] = Math.floor(v);
    }
  }
  return out;
}

export function pointsForLevel(
  ss: { categoryPointsTable: unknown } | null | undefined,
  level: number | null | undefined
): number {
  if (level == null) return 0;
  const table = readCategoryPoints(ss?.categoryPointsTable);
  return table[String(level)] ?? 0;
}
TS
echo "[+] Wrote src/lib/penalty-categories.ts"

# ===========================================================================
# 3. Scoring system edit form: add a 4-input "Penalty categories" section
# ===========================================================================
cat > outputs-tmp/patch-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/scoring-systems/[id]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add the import for the helper (used to compute defaults).
if (!s.includes('readCategoryPoints')) {
  s = s.replace(
    'import { updateScoringSystem } from "@/lib/actions/scoring-systems";',
    'import { updateScoringSystem } from "@/lib/actions/scoring-systems";\nimport { readCategoryPoints, PENALTY_LEVELS, PENALTY_LEVEL_LABEL } from "@/lib/penalty-categories";'
  );
}

// Insert a "categoryPoints" computation near the top of the component body.
if (!s.includes("const categoryPoints =")) {
  s = s.replace(
    "const points = (ss.pointsTable as Record<string, number>) ?? {};",
    "const points = (ss.pointsTable as Record<string, number>) ?? {};\n  const categoryPoints = readCategoryPoints(ss.categoryPointsTable);"
  );
}

// Add the new section just before "Penalty points application" (added in the
// previous push). If that anchor isn't present, fall back to before "Drop weeks".
const beforeA = `        <Section title="Penalty points application">`;
const beforeB = `        <Section title="Drop weeks">`;
const insertBlock = `        <Section title="Penalty categories">
          <p className="mb-3 text-xs text-zinc-500">
            CAS Community penalty levels. Points entered here are used the
            moment a steward picks a category on a decision. Changing these
            later does NOT alter past decisions (each penalty stores the
            points it was created with).
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PENALTY_LEVELS.map((lv) => (
              <Field
                key={lv}
                label={PENALTY_LEVEL_LABEL[lv]}
                name={\`categoryPoints_\${lv}\`}
                type="number"
                defaultValue={String(categoryPoints[String(lv)] ?? 0)}
                min={0}
                max={50}
              />
            ))}
          </div>
        </Section>

`;

if (s.includes("Penalty categories")) {
  console.log("Edit form: Penalty categories section already present.");
} else if (s.includes(beforeA)) {
  s = s.replace(beforeA, insertBlock + beforeA);
  console.log("Edit form: inserted Penalty categories before 'Penalty points application'.");
} else if (s.includes(beforeB)) {
  s = s.replace(beforeB, insertBlock + beforeB);
  console.log("Edit form: inserted Penalty categories before 'Drop weeks'.");
} else {
  console.error("Edit form: no anchor found for Penalty categories section.");
  process.exit(1);
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-edit.mjs

# ===========================================================================
# 4. updateScoringSystem action: read + save categoryPointsTable
# ===========================================================================
cat > outputs-tmp/patch-action-ss.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes("categoryPointsTable")) {
  // Add a small helper to read the 4 fields into a JSON object.
  if (!s.includes("readCategoryPointsFromForm")) {
    s = s.replace(
      `function readPointsTable(`,
      `function readCategoryPointsFromForm(formData: FormData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lv of [0, 1, 2, 3]) {
    const v = formData.get(\`categoryPoints_\${lv}\`);
    const n = v == null || String(v).trim() === "" ? 0 : parseInt(String(v), 10);
    out[String(lv)] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return out;
}

function readPointsTable(`
    );
  }

  // Read into a const after dropWorstNRounds line.
  s = s.replace(
    `  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));`,
    `  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));
  const categoryPointsTable = readCategoryPointsFromForm(formData);`
  );

  // Save in the prisma update data block.
  s = s.replace(
    `      participationInCombined,
      deferPenaltyPoints,
    },`,
    `      participationInCombined,
      deferPenaltyPoints,
      categoryPointsTable,
    },`
  );

  fs.writeFileSync(FILE, s);
  console.log("Action: categoryPointsTable wired.");
} else {
  console.log("Action: already wired.");
}
EOF
node outputs-tmp/patch-action-ss.mjs

# ===========================================================================
# 5. Steward decision form: replace text Category dropdown with numeric levels;
#    show the resulting points next to each label so the steward sees impact.
# ===========================================================================
cat > outputs-tmp/patch-decision-form.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 5a. Add helper imports.
if (!s.includes('readCategoryPoints')) {
  s = s.replace(
    `import { formatDateTime } from "@/lib/date";`,
    `import { formatDateTime } from "@/lib/date";\nimport { readCategoryPoints, PENALTY_LEVELS, PENALTY_LEVEL_LABEL } from "@/lib/penalty-categories";`
  );
}

// 5b. Load the scoringSystem on the round (needed for points lookup).
s = s.replace(
  `      round: { include: { season: { include: { league: true } } } },`,
  `      round: { include: { season: { include: { league: true, scoringSystem: true } } } },`
);

// 5c. Compute table once near the top of the component body, after notFound check.
if (!s.includes("const categoryPointsTable")) {
  s = s.replace(
    `  const accusedDrivers = report.involvedDrivers.filter(
    (d) => d.role === "ACCUSED"
  );`,
    `  const accusedDrivers = report.involvedDrivers.filter(
    (d) => d.role === "ACCUSED"
  );

  const categoryPointsTable = readCategoryPoints(
    report.round.season.scoringSystem.categoryPointsTable
  );`
  );
}

// 5d. Replace the old penaltyCategory dropdown with the numeric one.
const oldCategory = `          <label className="block">
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
          </label>`;
const newCategory = `          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Penalty category</span>
            <select
              name="categoryLevel"
              defaultValue={
                report.decision?.penalties?.[0]?.categoryLevel != null
                  ? String(report.decision.penalties[0].categoryLevel)
                  : ""
              }
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— (no category)</option>
              {PENALTY_LEVELS.map((lv) => (
                <option key={lv} value={String(lv)}>
                  {PENALTY_LEVEL_LABEL[lv]} — {categoryPointsTable[String(lv)] ?? 0} pts
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              When the verdict is "Points deduction", the category determines
              how many points are removed (per this scoring system's table).
            </span>
          </label>`;
if (!s.includes('name="categoryLevel"')) {
  if (!s.includes(oldCategory)) {
    console.error("Decision form: old category dropdown not found.");
    process.exit(1);
  }
  s = s.replace(oldCategory, newCategory);
}

// 5e. Drop the old CATEGORIES constant — no longer used.
s = s.replace(
  /const CATEGORIES = \[[\s\S]*?\];\n\n/,
  ""
);

fs.writeFileSync(FILE, s);
console.log("Decision form: numeric category dropdown wired.");
EOF
node outputs-tmp/patch-decision-form.mjs

# ===========================================================================
# 6. submitDecision action: take categoryLevel, look up points from scoring system,
#    save both categoryLevel + (when verdict is POINTS_DEDUCTION) the resolved pts.
# ===========================================================================
cat > outputs-tmp/patch-submit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/admin-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// Add helper import.
if (!s.includes('penalty-categories')) {
  s = s.replace(
    `import { requireSteward } from "@/lib/auth-helpers";`,
    `import { requireSteward } from "@/lib/auth-helpers";\nimport { pointsForLevel } from "@/lib/penalty-categories";`
  );
}

// Read categoryLevel and override pointsValue from the table.
if (!s.includes("categoryLevelRaw")) {
  s = s.replace(
    `  const penaltyCategoryRaw = String(formData.get("penaltyCategory") ?? "").trim();
  const penaltyCategory = penaltyCategoryRaw
    ? (penaltyCategoryRaw as PenaltyCategory)
    : null;`,
    `  const penaltyCategoryRaw = String(formData.get("penaltyCategory") ?? "").trim();
  const penaltyCategory = penaltyCategoryRaw
    ? (penaltyCategoryRaw as PenaltyCategory)
    : null;

  const categoryLevelRaw = String(formData.get("categoryLevel") ?? "").trim();
  const categoryLevel =
    categoryLevelRaw === "" ? null : parseInt(categoryLevelRaw, 10);`
  );
}

// After we load the report, look up the season's scoring system + override pointsValue
if (!s.includes("scoringSystemForCat")) {
  s = s.replace(
    `  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: { round: true },
  });`,
    `  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { include: { season: { include: { scoringSystem: true } } } },
    },
  });
  const scoringSystemForCat =
    report?.round.season.scoringSystem ?? null;
  const categoryDerivedPoints = pointsForLevel(scoringSystemForCat, categoryLevel);`
  );
  // Need to update pointsValue for POINTS_DEDUCTION when category set.
  s = s.replace(
    `  const pointsValueRaw = String(formData.get("pointsValue") ?? "").trim();
  const pointsValue = pointsValueRaw ? Math.abs(parseInt(pointsValueRaw, 10) || 0) : 0;`,
    `  let pointsValueRaw = String(formData.get("pointsValue") ?? "").trim();
  let pointsValue = pointsValueRaw ? Math.abs(parseInt(pointsValueRaw, 10) || 0) : 0;`
  );
  // After both are read, if category is set, override pointsValue.
  s = s.replace(
    `  if (!publicSummary) {`,
    `  if (categoryLevel != null) {
    pointsValue = categoryDerivedPoints;
  }
  if (!publicSummary) {`
  );
}

// Save categoryLevel onto the Penalty row.
if (!s.includes("categoryLevel,")) {
  s = s.replace(
    `        category: penaltyCategory,
      },
    });
  }`,
    `        category: penaltyCategory,
        categoryLevel,
      },
    });
  }`
  );
}

fs.writeFileSync(FILE, s);
console.log("submitDecision: numeric category wired.");
EOF
node outputs-tmp/patch-submit.mjs

# ===========================================================================
# 7. Penalty pool page: show "Cat N" instead of (or alongside) the old category.
# ===========================================================================
cat > outputs-tmp/patch-pool.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace category cell to use categoryLevel first, fallback to enum if older.
const before = `                          <td className="px-2 py-2 text-xs text-zinc-300">
                            {p.category ? CATEGORY_LABEL[p.category] ?? p.category : "—"}
                          </td>`;
const after = `                          <td className="px-2 py-2 text-xs text-zinc-300">
                            {p.categoryLevel != null
                              ? \`Cat \${p.categoryLevel}\`
                              : p.category
                                ? CATEGORY_LABEL[p.category] ?? p.category
                                : "—"}
                          </td>`;
if (!s.includes('Cat ${p.categoryLevel}')) {
  if (!s.includes(before)) { console.error("Pool page: category cell anchor not found."); process.exit(1); }
  s = s.replace(before, after);
}

fs.writeFileSync(FILE, s);
console.log("Pool page: category cell wired.");
EOF
node outputs-tmp/patch-pool.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Penalty categories: switch to 4 numeric CAS levels (Cat 0–3) with per-scoring-system points table; Cat 0 = warning"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
