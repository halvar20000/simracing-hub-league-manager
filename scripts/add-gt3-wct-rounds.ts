import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEAGUE_SLUG = "cas-gt3-wct";

interface RoundSpec {
  name: string;
  track: string;
  trackConfig: string | null;
  startsAt: string; // ISO with explicit offset to handle DST correctly
}

// 18:00 CET = 17:00 UTC (winter, until last Sunday of March)
// 18:00 CEST = 16:00 UTC (summer, last Sunday of March → last Sunday of Oct)
// In 2026, DST starts on Sunday 29 March, so Round 1 (24 March) is CET (+01:00)
// and Rounds 2 onwards are CEST (+02:00).
const rounds: RoundSpec[] = [
  { name: "St. Petersburg",         track: "St. Petersburg",                   trackConfig: null,         startsAt: "2026-03-24T18:00:00+01:00" },
  { name: "Sebring International",  track: "Sebring International Raceway",    trackConfig: null,         startsAt: "2026-03-31T18:00:00+02:00" },
  { name: "Summit Point",           track: "Summit Point Raceway",             trackConfig: null,         startsAt: "2026-04-07T18:00:00+02:00" },
  { name: "Circuit de Spa",         track: "Circuit de Spa-Francorchamps",     trackConfig: "Grand Prix", startsAt: "2026-04-14T18:00:00+02:00" },
  { name: "Mugello GP",             track: "Autodromo Internazionale del Mugello", trackConfig: "Grand Prix", startsAt: "2026-04-21T18:00:00+02:00" },
  { name: "Fuji GP",                track: "Fuji International Speedway",      trackConfig: "Grand Prix", startsAt: "2026-04-28T18:00:00+02:00" },
  { name: "Brands Hatch GP",        track: "Brands Hatch",                     trackConfig: "Grand Prix", startsAt: "2026-05-05T18:00:00+02:00" },
  { name: "Adelaide Street Circuit",track: "Adelaide Street Circuit",          trackConfig: null,         startsAt: "2026-05-12T18:00:00+02:00" },
  { name: "Suzuka GP",              track: "Suzuka International Racing Course", trackConfig: "Grand Prix", startsAt: "2026-05-19T18:00:00+02:00" },
  { name: "Magny-Cours GP",         track: "Circuit de Nevers Magny-Cours",    trackConfig: "Grand Prix", startsAt: "2026-05-26T18:00:00+02:00" },
  { name: "Thruxton Circuit",       track: "Thruxton Circuit",                 trackConfig: null,         startsAt: "2026-06-02T18:00:00+02:00" },
  { name: "Special Event (TBD)",    track: "TBD",                              trackConfig: null,         startsAt: "2026-06-08T18:00:00+02:00" },
];

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
  });
  if (!league) {
    console.error(`League "${LEAGUE_SLUG}" not found.`);
    process.exit(1);
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season in CAS GT3 WCT — create one first in admin.");
    process.exit(1);
  }

  console.log(`Adding ${rounds.length} rounds to ${season.name} ${season.year} (${season.id})\n`);

  const lastRound = await prisma.round.findFirst({
    where: { seasonId: season.id },
    orderBy: { roundNumber: "desc" },
  });
  let nextNumber = (lastRound?.roundNumber ?? 0) + 1;

  for (const r of rounds) {
    const created = await prisma.round.create({
      data: {
        seasonId: season.id,
        roundNumber: nextNumber++,
        name: r.name,
        track: r.track,
        trackConfig: r.trackConfig,
        startsAt: new Date(r.startsAt),
        countsForChampionship: true,
      },
    });
    const d = new Date(r.startsAt);
    const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    console.log(
      `  Rd ${created.roundNumber.toString().padStart(2)}  ${date}  ${r.name}` +
        (r.trackConfig ? ` (${r.trackConfig})` : "")
    );
  }

  console.log(`\nDone — ${rounds.length} rounds added.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
