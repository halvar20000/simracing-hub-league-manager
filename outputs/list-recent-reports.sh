#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const reports = await p.incidentReport.findMany({
    orderBy: { submittedAt: 'desc' },
    take: 15,
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: { select: { firstName: true, lastName: true } },
      decision: true,
    },
  });
  console.log('=== Most recent 15 incident reports ===');
  for (const r of reports) {
    const reporter = (r.reporterUser.firstName ?? '') + ' ' + (r.reporterUser.lastName ?? '');
    const desc = (r.description ?? '').replace(/\\s+/g, ' ').slice(0, 80);
    console.log('');
    console.log('  id           : ' + r.id);
    console.log('  league/season: ' + r.round.season.league.slug + ' / ' + r.round.season.name);
    console.log('  round        : R' + r.round.roundNumber + ' ' + r.round.name);
    console.log('  reporter     : ' + reporter.trim());
    console.log('  status       : ' + r.status + (r.decision ? ' (has decision)' : ''));
    console.log('  submitted    : ' + r.submittedAt.toISOString());
    console.log('  irlmReviewId : ' + (r.irlmReviewId ?? '-'));
    console.log('  irlmProtestId: ' + (r.irlmProtestId ?? '-'));
    console.log('  description  : ' + desc + (desc.length === 80 ? '…' : ''));
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
