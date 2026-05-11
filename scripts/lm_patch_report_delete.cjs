const fs = require("fs");
const FILE =
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

if (s.includes("deleteIncidentReport")) {
  console.log("  Delete button already present. Nothing to do.");
  process.exit(0);
}

// 2a. Import deleteIncidentReport (extend the existing import group from admin-reports)
s = s.replace(
  /import \{\s*\n\s*submitDecision,\s*\n\s*setReportStatus,\s*\n\s*deleteDecision,\s*\n\}\s+from\s+"@\/lib\/actions\/admin-reports";/,
  `import {\n  submitDecision,\n  setReportStatus,\n  deleteDecision,\n  deleteIncidentReport,\n} from "@/lib/actions/admin-reports";`
);

// 2b. Bind the action near the other binds (right after removeDecision)
s = s.replace(
  /(const removeDecision = deleteDecision\.bind\(null, slug, seasonId, reportId\);)/,
  `$1\n  const deleteReport = deleteIncidentReport.bind(null, slug, seasonId, reportId);`
);

// 2c. Insert "Danger zone" at the very end of the page, before the final
//     closing `</div>` that wraps the JSX. The page's outermost wrapper is
//     `<div className="space-y-6">` (top of return). The matching close is the
//     LAST `  );\n}` in the file. We insert before that final `  </div>\n  );`.
const DANGER_BLOCK = [
  "      <section className=\"mt-8 rounded border border-red-900/60 bg-red-950/20 p-4\">",
  "        <h2 className=\"font-display text-[10px] font-semibold uppercase tracking-widest text-red-300\">",
  "          Danger zone",
  "        </h2>",
  "        <details className=\"mt-2\">",
  "          <summary className=\"cursor-pointer text-sm text-red-300 hover:text-red-200\">",
  "            Delete this report permanently",
  "          </summary>",
  "          <div className=\"mt-3 space-y-2\">",
  "            <p className=\"text-xs text-zinc-400\">",
  "              This removes the report, its evidence, comments, involved drivers, the decision and any penalties tied to it. The penalty pool will be recomputed. This action cannot be undone.",
  "            </p>",
  "            <form action={deleteReport}>",
  "              <SubmitWithSpinner",
  "                label=\"Yes, permanently delete this report\"",
  "                pendingLabel=\"Deleting…\"",
  "                className=\"rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600\"",
  "              />",
  "            </form>",
  "          </div>",
  "        </details>",
  "      </section>",
  "    </div>",
  "  );",
  "}",
].join("\n");

const CLOSING_ANCHOR = "    </div>\n  );\n}";
const lastIdx = s.lastIndexOf(CLOSING_ANCHOR);
if (lastIdx === -1) {
  console.error("  Could not find closing `</div>\\n);\\n}` anchor. Aborting.");
  process.exit(1);
}
s = s.slice(0, lastIdx) + DANGER_BLOCK + s.slice(lastIdx + CLOSING_ANCHOR.length);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
