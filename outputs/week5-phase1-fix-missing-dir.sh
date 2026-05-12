#!/usr/bin/env bash
# Create the missing subdirectory + file that failed in week5-phase1-reporting.sh

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx' <<'EOF'
import { redirect } from "next/navigation";

// Reuse the shared report detail page; it already handles admin viewers.
export default async function AdminReportDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; reportId: string }>;
}) {
  const { reportId } = await params;
  redirect(`/reports/${reportId}`);
}
EOF

echo "Done."
echo ""
echo "Now re-run the rest of the patches the script was about to do (the node-based patches"
echo "for round results / season detail / nav). Easiest: just re-run the full Week 5 setup script:"
echo ""
echo "  bash <(cat ~/Library/Application\\ Support/Claude/local-agent-mode-sessions/.../outputs/week5-phase1-reporting.sh)"
echo ""
echo "It's idempotent — the file writes overwrite, the node patches skip if already applied."
