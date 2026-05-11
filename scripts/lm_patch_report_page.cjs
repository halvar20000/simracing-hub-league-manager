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
