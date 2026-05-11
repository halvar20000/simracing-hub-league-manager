#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Append deleteIncidentReport action to admin-reports.ts
# ============================================================================
echo "=== 1. Add deleteIncidentReport to src/lib/actions/admin-reports.ts ==="
ACT='src/lib/actions/admin-reports.ts'
if grep -q '^export async function deleteIncidentReport\b' "$ACT"; then
  echo "  Already present."
else
  cat >> "$ACT" <<'TS'

/**
 * Permanently delete an incident report (and everything attached to it).
 * Cascades remove: involvedDrivers, evidence, comments, decision.
 * Penalty rows are not cascaded by the schema, so we delete them explicitly.
 * Finally recompute the penalty pool since we may have removed pool points.
 */
export async function deleteIncidentReport(
  leagueSlug: string,
  seasonId: string,
  reportId: string
) {
  await requireSteward();

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: { decision: { select: { id: true } } },
  });
  if (!report) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  }

  if (report.decision) {
    await prisma.penalty.deleteMany({
      where: { sourceIncidentDecisionId: report.decision.id },
    });
  }

  await prisma.incidentReport.delete({ where: { id: reportId } });

  // Recompute pool (no-op outside GT3 WCT)
  await recomputePenaltyPoolForSeason(seasonId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/incidents`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
}
TS
  echo "  Appended."
fi

echo "-- Verify --"
grep -nE '^export async function' "$ACT"

# ============================================================================
# 2. Patch admin report detail page — add Danger zone + Delete button
# ============================================================================
echo ""
echo "=== 2. Patch admin report detail page ==="
mkdir -p scripts
cat > scripts/lm_patch_report_delete.cjs <<'JS'
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
JS

node scripts/lm_patch_report_delete.cjs

echo ""
echo "-- Verify --"
F='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'
grep -nE 'deleteIncidentReport|Danger zone|Yes, permanently delete' "$F" | head -10

# ============================================================================
# 3. tsc + commit + push
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Admin: add per-report 'Delete report permanently' button (Danger zone). Cascades remove involvedDrivers/evidence/comments/decision; explicit penalty delete + pool recompute."
git push

echo ""
echo "Done."
