#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

cat > ./_open_iec_test.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 4' } },
  });
  if (!season) {
    console.error('  IEC Season 4 not found.');
    process.exit(1);
  }

  const round = await p.round.findFirst({
    where: { seasonId: season.id, roundNumber: 1 },
  });
  if (!round) {
    console.error('  Round 1 not found for IEC Season 4.');
    process.exit(1);
  }

  console.log('Round before:');
  console.log('  id          ' + round.id);
  console.log('  R' + round.roundNumber + '  ' + round.name);
  console.log('  status      ' + round.status);
  console.log('  startsAt    ' + round.startsAt.toISOString() + '   ← SAVE THIS');
  console.log('  reportingNotifiedAt  ' + (round.reportingNotifiedAt?.toISOString() ?? 'null'));

  // Set startsAt to 24 hours ago — guarantees the reporting window
  // (12h cooldown + 48h window = open from -12h to -60h since startsAt) is live.
  const newStartsAt = new Date(Date.now() - 24 * 3600 * 1000);

  const updated = await p.round.update({
    where: { id: round.id },
    data: {
      status: 'COMPLETED',
      startsAt: newStartsAt,
      // Reset notification flag so the cron / manual trigger can re-fire
      // for the demo. If you DON'T want a real Discord post to fire on the
      // next cron run, comment out the next line.
      reportingNotifiedAt: null,
    },
  });

  console.log('');
  console.log('Round after:');
  console.log('  status      ' + updated.status);
  console.log('  startsAt    ' + updated.startsAt.toISOString() + '   (= now - 24h)');
  console.log('  reportingNotifiedAt  ' + (updated.reportingNotifiedAt?.toISOString() ?? 'null'));

  console.log('');
  console.log('Reporting window is now OPEN for this round.');
  console.log('  • Public /leagues should show it in the amber "Open for reporting" frame');
  console.log('  • Direct URL:');
  console.log('      https://league.simracing-hub.com/leagues/cas-iec/seasons/' + season.id + '/rounds/' + round.id + '/report');
  console.log('');
  console.log('REVERT WHEN DONE FILMING:');
  console.log('  Run a one-off node script with this Prisma update:');
  console.log('');
  console.log('    await prisma.round.update({');
  console.log('      where: { id: \"' + round.id + '\" },');
  console.log('      data: {');
  console.log('        status: \"' + round.status + '\",');
  console.log('        startsAt: new Date(\"' + round.startsAt.toISOString() + '\"),');
  console.log('        reportingNotifiedAt: ' + (round.reportingNotifiedAt ? `new Date("${round.reportingNotifiedAt.toISOString()}")` : 'null') + ',');
  console.log('      },');
  console.log('    });');
  console.log('');
  console.log('  …or just tell me and I\\'ll generate the revert script.');

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
JS
node ./_open_iec_test.cjs
rm ./_open_iec_test.cjs
