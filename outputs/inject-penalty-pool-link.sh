#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "=== Lines 95-120 (around the reports link) ==="
sed -n '95,120p' "$PAGE"
echo ""

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("/penalty-pool")) {
  console.log("Penalty pool link already present.");
  process.exit(0);
}

// 1. Add a query for pending penalty count next to the existing counts.
if (!s.includes("pendingPenaltyCount")) {
  s = s.replace(
    `  const reportNewCount = await prisma.incidentReport.count({
    where: { round: { seasonId }, status: "SUBMITTED" },
  });`,
    `  const reportNewCount = await prisma.incidentReport.count({
    where: { round: { seasonId }, status: "SUBMITTED" },
  });
  const pendingPenaltyCount = await prisma.penalty.count({
    where: {
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      round: { seasonId },
    },
  });`
  );
  console.log("Added pendingPenaltyCount query.");
}

// 2. Find the reports Link block and inject a Penalty pool Link right after it.
//    The reports href line is at ~line 103. We walk forward to its </Link>.
const lines = s.split("\n");
let reportsHrefLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("/admin/leagues/${slug}/seasons/${seasonId}/reports")) {
    reportsHrefLine = i;
    break;
  }
}
if (reportsHrefLine === -1) {
  console.error("Could not find reports href line.");
  process.exit(1);
}

// Walk forward to the closing </Link>
let closeLine = -1;
for (let i = reportsHrefLine; i < lines.length && i < reportsHrefLine + 30; i++) {
  if (lines[i].includes("</Link>")) { closeLine = i; break; }
}
if (closeLine === -1) {
  console.error("Could not find </Link> for reports link.");
  process.exit(1);
}

// Capture indentation from the </Link> line so the inserted JSX matches.
const indent = (lines[closeLine].match(/^(\s*)/) || ["", ""])[1];

const block = [
  `${indent}<Link`,
  `${indent}  href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/penalty-pool\`}`,
  `${indent}  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"`,
  `${indent}>`,
  `${indent}  Penalty pool`,
  `${indent}  {pendingPenaltyCount > 0 && (`,
  `${indent}    <span className="ml-1.5 inline-block min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">`,
  `${indent}      {pendingPenaltyCount}`,
  `${indent}    </span>`,
  `${indent}  )}`,
  `${indent}</Link>`,
];

lines.splice(closeLine + 1, 0, ...block);
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`Inserted Penalty pool link after line ${closeLine + 1}.`);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== After: lines around the reports link ==="
sed -n '95,140p' "$PAGE"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Admin season page: add 'Penalty pool' link with pending-count badge next to Reports"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
