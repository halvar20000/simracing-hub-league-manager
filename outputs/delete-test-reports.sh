#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const TARGETS = [
  'cmomj03dm0001ju0457da8scg',  // Thomas Herbrig 'bla bla bla' R6 Fuji
  'cmoh6n64j0001jl041s82apd8',  // Thomas Herbrig 'bla bla bla' R5 Mugello
];
async function main() {
  for (const id of TARGETS) {
    const r = await p.incidentReport.findUnique({
      where: { id },
      include: { decision: { include: { penalties: true } } },
    });
    if (!r) { console.log('  ' + id + ' — not found'); continue; }

    // Wipe penalty rows tied to this report's decision (the FK to IncidentDecision is
    // optional, so we want to clear them before deleting the decision/cascade).
    if (r.decision) {
      await p.penalty.deleteMany({ where: { sourceIncidentDecisionId: r.decision.id } });
    }

    await p.incidentReport.delete({ where: { id } });
    console.log('  Deleted ' + id);
  }
  console.log('');
  const rest = await p.incidentReport.count();
  console.log('Total reports remaining: ' + rest);
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
